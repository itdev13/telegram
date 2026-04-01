# MTProto Phone Number Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram phone number login (MTProto via GramJS) as a second connection mode alongside existing Bot API, syncing private DMs with GHL Conversations.

**Architecture:** Dual-service approach — new `ConnectionManager` + `GramJsService` alongside existing `TelegramService`. The `Installation` schema gains a `connectionType` field (`'bot'`|`'phone'`). Outbound webhook checks connection type and delegates to the right transport. Inbound phone messages arrive via GramJS event handlers (not HTTP webhooks).

**Tech Stack:** GramJS (`telegram` npm), Express, Mongoose, AES-256-GCM encryption (existing `CryptoService`), React 18

**Spec:** `docs/superpowers/specs/2026-04-01-mtproto-phone-number-integration-design.md`

---

## Chunk 1: Schemas & ConnectionManager

### Task 1: Install GramJS dependency

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install the `telegram` npm package**

```bash
cd backend && npm install telegram
```

- [ ] **Step 2: Add new env vars to `.env.example`**

Add to `backend/.env.example`:
```
# ── Telegram MTProto (Phone Number Login) ─────────
TELEGRAM_API_ID="your-api-id-from-my-telegram-org"
TELEGRAM_API_HASH="your-api-hash-from-my-telegram-org"
```

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example
git commit -m "feat: add GramJS (telegram) dependency for MTProto phone login"
```

---

### Task 2: Update Installation schema with connectionType and phoneConfig

**Files:**
- Modify: `backend/src/schemas/installation.schema.js`

- [ ] **Step 1: Add PhoneConfigSchema and new fields**

Add above `InstallationSchema` definition in `backend/src/schemas/installation.schema.js`:

```js
const PhoneConfigSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true },
    sessionString: { type: String, required: true },
    telegramUserId: { type: String },
    telegramUsername: { type: String },
    displayName: { type: String },
    isActive: { type: Boolean, default: true },
    lastActivityAt: { type: Date },
    connectedAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);
```

Add these fields to `InstallationSchema`:

```js
connectionType: { type: String, enum: ['bot', 'phone'], default: 'bot' },
phoneConfig: { type: PhoneConfigSchema, default: null },
```

Add compound index after schema definition:

```js
InstallationSchema.index({ connectionType: 1, 'phoneConfig.isActive': 1 });
```

- [ ] **Step 2: Verify the backend starts without errors**

```bash
cd backend && node -e "require('./src/schemas/installation.schema')"
```

Expected: No errors, clean exit.

- [ ] **Step 3: Commit**

```bash
git add backend/src/schemas/installation.schema.js
git commit -m "feat: add connectionType and phoneConfig to Installation schema"
```

---

### Task 3: Create PhoneAuthSession schema

**Files:**
- Create: `backend/src/schemas/phone-auth-session.schema.js`

- [ ] **Step 1: Create the schema file**

```js
const mongoose = require('mongoose');

const PhoneAuthSessionSchema = new mongoose.Schema(
  {
    locationId: { type: String, required: true, unique: true, index: true },
    phoneNumber: { type: String, required: true },
    phoneCodeHash: { type: String, required: true },
    tempSessionString: { type: String, required: true },
    step: { type: String, required: true, enum: ['code_sent', 'awaiting_2fa'] },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 10 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { collection: 'phone_auth_sessions', timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model('PhoneAuthSession', PhoneAuthSessionSchema);
```

- [ ] **Step 2: Verify the schema loads**

```bash
cd backend && node -e "require('./src/schemas/phone-auth-session.schema')"
```

Expected: No errors, clean exit.

- [ ] **Step 3: Commit**

```bash
git add backend/src/schemas/phone-auth-session.schema.js
git commit -m "feat: add PhoneAuthSession schema for multi-step phone auth"
```

---

### Task 4: Create PendingUpdate schema (write-ahead log)

**Files:**
- Create: `backend/src/schemas/pending-update.schema.js`

- [ ] **Step 1: Create the schema file**

```js
const mongoose = require('mongoose');

const PendingUpdateSchema = new mongoose.Schema(
  {
    locationId: { type: String, required: true, index: true },
    rawUpdate: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastAttemptAt: { type: Date },
    errorMessage: { type: String },
    processedAt: { type: Date },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { collection: 'pending_updates', timestamps: { createdAt: true, updatedAt: false } },
);

PendingUpdateSchema.index({ status: 1, attempts: 1 });

module.exports = mongoose.model('PendingUpdate', PendingUpdateSchema);
```

- [ ] **Step 2: Verify the schema loads**

```bash
cd backend && node -e "require('./src/schemas/pending-update.schema')"
```

Expected: No errors, clean exit.

- [ ] **Step 3: Commit**

```bash
git add backend/src/schemas/pending-update.schema.js
git commit -m "feat: add PendingUpdate schema for write-ahead log"
```

---

### Task 5: Create ConnectionManager

**Files:**
- Create: `backend/src/telegram/connection-manager.js`

This is the core GramJS client pool. All GramJS interaction goes through this class. No other part of the app touches `TelegramClient` directly.

- [ ] **Step 1: Create the ConnectionManager class**

```js
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const Installation = require('../schemas/installation.schema');

const GRAMJS_CONFIG = {
  connectionRetries: 5,
  requestRetries: 3,
  autoReconnect: true,
  retryDelay: 2000,
  floodSleepThreshold: 120,
};

class ConnectionManager {
  constructor(cryptoService) {
    this.crypto = cryptoService;
    this.clients = new Map();
    this.messageHandlers = new Map();

    const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
    const apiHash = process.env.TELEGRAM_API_HASH;
    if (!apiId || !apiHash) {
      console.warn('TELEGRAM_API_ID or TELEGRAM_API_HASH not set — phone login disabled');
      this.disabled = true;
      return;
    }
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.disabled = false;
  }

  // ── Client Lifecycle ─────────────────────────────────

  async connect(locationId, encryptedSessionString) {
    if (this.disabled) throw new Error('Phone login is not configured on this server');

    // Disconnect existing client if any
    if (this.clients.has(locationId)) {
      await this.disconnect(locationId);
    }

    const sessionString = this.crypto.decrypt(encryptedSessionString);
    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, this.apiId, this.apiHash, GRAMJS_CONFIG);

    try {
      await client.connect();

      // Verify the session is still valid
      const me = await client.getMe();
      console.log(
        `GramJS connected for location ${locationId}: @${me.username || me.id}`,
      );

      this.clients.set(locationId, { client, connected: true, userId: me.id });

      // Register message handler if one was set before connection
      this._registerEventHandler(locationId);

      return me;
    } catch (error) {
      // Clean up on failure
      try {
        await client.destroy();
      } catch {
        // ignore cleanup errors
      }

      if (
        error.message?.includes('AUTH_KEY_UNREGISTERED') ||
        error.message?.includes('SESSION_REVOKED')
      ) {
        console.error(`Session revoked for location ${locationId}`);
        await Installation.updateOne(
          { locationId },
          { 'phoneConfig.isActive': false },
        );
      }

      throw error;
    }
  }

  async disconnect(locationId) {
    const entry = this.clients.get(locationId);
    if (!entry) return;

    try {
      // Save session before destroying
      const sessionString = entry.client.session.save();
      if (sessionString) {
        const encrypted = this.crypto.encrypt(sessionString);
        await Installation.updateOne(
          { locationId },
          { 'phoneConfig.sessionString': encrypted },
        );
      }

      await entry.client.destroy();
    } catch (error) {
      console.error(`Error disconnecting client for ${locationId}:`, error.message);
    }

    this.clients.delete(locationId);
  }

  async disconnectAll() {
    const locationIds = Array.from(this.clients.keys());
    console.log(`Disconnecting ${locationIds.length} GramJS clients...`);

    for (const locationId of locationIds) {
      await this.disconnect(locationId);
    }

    console.log('All GramJS clients disconnected');
  }

  // ── Client Access ────────────────────────────────────

  getClient(locationId) {
    const entry = this.clients.get(locationId);
    return entry?.connected ? entry.client : null;
  }

  isConnected(locationId) {
    const entry = this.clients.get(locationId);
    return entry?.connected === true;
  }

  // ── Messaging ────────────────────────────────────────

  async sendMessage(locationId, chatId, text) {
    const client = this._getClientOrThrow(locationId);
    const result = await client.sendMessage(chatId, { message: text });
    return result.id;
  }

  async sendPhoto(locationId, chatId, photoUrl, caption) {
    const client = this._getClientOrThrow(locationId);
    const result = await client.sendMessage(chatId, {
      file: photoUrl,
      message: caption || '',
    });
    return result.id;
  }

  async sendDocument(locationId, chatId, documentUrl, caption) {
    const client = this._getClientOrThrow(locationId);
    const result = await client.sendMessage(chatId, {
      file: documentUrl,
      message: caption || '',
      forceDocument: true,
    });
    return result.id;
  }

  async downloadMedia(locationId, media) {
    const client = this._getClientOrThrow(locationId);
    return client.downloadMedia(media);
  }

  // ── Event Handlers ───────────────────────────────────

  onNewMessage(locationId, callback) {
    this.messageHandlers.set(locationId, callback);

    // If client already connected, register immediately
    if (this.clients.has(locationId)) {
      this._registerEventHandler(locationId);
    }
  }

  _registerEventHandler(locationId) {
    const entry = this.clients.get(locationId);
    const handler = this.messageHandlers.get(locationId);
    if (!entry || !handler) return;

    entry.client.addEventHandler(async (event) => {
      try {
        // Only handle private DMs (not groups/channels)
        if (!event.isPrivate) return;

        await handler(event);
      } catch (error) {
        console.error(
          `Error handling inbound message for location ${locationId}:`,
          error.message,
        );
      }
    }, new NewMessage({ incoming: true }));
  }

  // ── Startup: Staggered Reconnection ──────────────────

  async initAllClients() {
    if (this.disabled) {
      console.log('Phone login disabled — skipping GramJS client initialization');
      return;
    }

    const installations = await Installation.find({
      connectionType: 'phone',
      'phoneConfig.isActive': true,
      'phoneConfig.sessionString': { $exists: true, $ne: '' },
    }).sort({ 'phoneConfig.lastActivityAt': -1 });

    if (installations.length === 0) {
      console.log('No active phone connections to restore');
      return;
    }

    console.log(`Restoring ${installations.length} phone connections (staggered)...`);

    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 3000;

    for (let i = 0; i < installations.length; i += BATCH_SIZE) {
      const batch = installations.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (inst) => {
          try {
            await this.connect(inst.locationId, inst.phoneConfig.sessionString);
          } catch (error) {
            if (error.message?.includes('FLOOD_WAIT')) {
              const seconds = parseInt(error.message.split('_').pop(), 10) || 60;
              console.warn(
                `FLOOD_WAIT for ${inst.locationId}: waiting ${seconds}s`,
              );
            } else {
              console.error(
                `Failed to restore connection for ${inst.locationId}:`,
                error.message,
              );
            }
          }
        }),
      );

      // Delay between batches (except after the last one)
      if (i + BATCH_SIZE < installations.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    console.log(`GramJS init complete: ${this.clients.size}/${installations.length} connected`);
  }

  // ── Internal Helpers ─────────────────────────────────

  _getClientOrThrow(locationId) {
    const client = this.getClient(locationId);
    if (!client) {
      const err = new Error(`No active phone connection for location: ${locationId}`);
      err.statusCode = 400;
      throw err;
    }
    return client;
  }
}

module.exports = ConnectionManager;
```

- [ ] **Step 2: Verify the module loads (without env vars, should warn)**

```bash
cd backend && node -e "const CM = require('./src/telegram/connection-manager'); const c = new CM({ encrypt: () => '', decrypt: () => '' }); console.log('disabled:', c.disabled)"
```

Expected: Prints warning about missing env vars and `disabled: true`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/telegram/connection-manager.js
git commit -m "feat: add ConnectionManager for GramJS client pool lifecycle"
```

---

## Chunk 2: GramJsService & Auth Flow

### Task 6: Create GramJsService with auth flow

**Files:**
- Create: `backend/src/telegram/gramjs.service.js`

- [ ] **Step 1: Create the GramJsService class**

```js
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { computeCheck } = require('telegram/Password');
const Installation = require('../schemas/installation.schema');
const PhoneAuthSession = require('../schemas/phone-auth-session.schema');
const PendingUpdate = require('../schemas/pending-update.schema');
const { MessageLog, MessageDirection, MessageStatus } = require('../schemas/message-log.schema');

class GramJsService {
  constructor(connectionManager, cryptoService, ghlService, contactMappingService, telegramService) {
    this.connectionManager = connectionManager;
    this.crypto = cryptoService;
    this.ghlService = ghlService;
    this.contactMapping = contactMappingService;
    this.telegramService = telegramService;

    const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
    const apiHash = process.env.TELEGRAM_API_HASH;
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.disabled = !apiId || !apiHash;
  }

  // ── Auth Flow ────────────────────────────────────────

  async sendCode(locationId, phoneNumber) {
    if (this.disabled) throw new Error('Phone login is not configured');

    // Clean up any existing auth session
    await PhoneAuthSession.deleteOne({ locationId });

    const session = new StringSession('');
    const client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
    });

    await client.connect();

    try {
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber,
          apiId: this.apiId,
          apiHash: this.apiHash,
          settings: new Api.CodeSettings({}),
        }),
      );

      // Save the temporary session and phone code hash
      const tempSessionString = client.session.save();

      await PhoneAuthSession.create({
        locationId,
        phoneNumber,
        phoneCodeHash: result.phoneCodeHash,
        tempSessionString: this.crypto.encrypt(tempSessionString),
        step: 'code_sent',
      });

      // Destroy to free resources (session string is already saved)
      await client.destroy();

      return { phoneCodeHash: result.phoneCodeHash };
    } catch (error) {
      await client.destroy();

      if (error.message?.includes('PHONE_NUMBER_INVALID')) {
        const err = new Error('Invalid phone number format');
        err.statusCode = 400;
        throw err;
      }
      if (error.message?.includes('FLOOD_WAIT')) {
        const seconds = parseInt(error.message.split('_').pop(), 10) || 60;
        const err = new Error(`Too many attempts. Please wait ${seconds} seconds.`);
        err.statusCode = 429;
        throw err;
      }
      throw error;
    }
  }

  async verifyCode(locationId, phoneCode) {
    const authSession = await PhoneAuthSession.findOne({ locationId });
    if (!authSession) {
      const err = new Error('No pending auth session. Please request a new code.');
      err.statusCode = 400;
      throw err;
    }

    const tempSessionString = this.crypto.decrypt(authSession.tempSessionString);
    const client = new TelegramClient(
      new StringSession(tempSessionString),
      this.apiId,
      this.apiHash,
      { connectionRetries: 5 },
    );

    await client.connect();

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: authSession.phoneNumber,
          phoneCodeHash: authSession.phoneCodeHash,
          phoneCode,
        }),
      );

      // Success — save final session and complete auth
      return await this._completeAuth(client, locationId, authSession.phoneNumber);
    } catch (error) {
      if (error.message?.includes('SESSION_PASSWORD_NEEDED')) {
        // 2FA required — save updated session and wait for password
        const updatedSession = client.session.save();
        await PhoneAuthSession.updateOne(
          { locationId },
          {
            tempSessionString: this.crypto.encrypt(updatedSession),
            step: 'awaiting_2fa',
          },
        );
        await client.destroy();

        return { require2FA: true };
      }

      await client.destroy();

      if (error.message?.includes('PHONE_CODE_INVALID')) {
        const err = new Error('Invalid verification code');
        err.statusCode = 400;
        throw err;
      }
      if (error.message?.includes('PHONE_CODE_EXPIRED')) {
        await PhoneAuthSession.deleteOne({ locationId });
        const err = new Error('Verification code expired. Please request a new one.');
        err.statusCode = 400;
        throw err;
      }
      throw error;
    }
  }

  async submit2FA(locationId, password) {
    const authSession = await PhoneAuthSession.findOne({
      locationId,
      step: 'awaiting_2fa',
    });
    if (!authSession) {
      const err = new Error('No pending 2FA session. Please start over.');
      err.statusCode = 400;
      throw err;
    }

    const tempSessionString = this.crypto.decrypt(authSession.tempSessionString);
    const client = new TelegramClient(
      new StringSession(tempSessionString),
      this.apiId,
      this.apiHash,
      { connectionRetries: 5 },
    );

    await client.connect();

    try {
      const passwordResult = await client.invoke(new Api.account.GetPassword());
      const passwordCheck = await computeCheck(passwordResult, password);
      await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));

      return await this._completeAuth(client, locationId, authSession.phoneNumber);
    } catch (error) {
      await client.destroy();

      if (error.message?.includes('PASSWORD_HASH_INVALID')) {
        const err = new Error('Incorrect password');
        err.statusCode = 401;
        throw err;
      }
      throw error;
    }
  }

  async _completeAuth(client, locationId, phoneNumber) {
    const me = await client.getMe();
    const finalSession = client.session.save();
    const encryptedSession = this.crypto.encrypt(finalSession);

    // Destroy the auth client BEFORE ConnectionManager creates a new one
    // (two clients sharing the same auth key causes AUTH_KEY_DUPLICATED)
    await client.destroy();

    // Check if location has an existing bot — tear it down
    // Uses injected telegramService (passed via constructor, see below)
    const existing = await Installation.findOne({ locationId });
    if (existing?.telegramConfig && this.telegramService) {
      try {
        const botToken = this.crypto.decrypt(existing.telegramConfig.botToken);
        await this.telegramService.deleteWebhook(botToken);
      } catch (err) {
        console.warn(`Failed to clean up old bot webhook for ${locationId}:`, err.message);
      }
    }

    // Save phone config to Installation
    await Installation.findOneAndUpdate(
      { locationId },
      {
        connectionType: 'phone',
        telegramConfig: null,
        phoneConfig: {
          phoneNumber,
          sessionString: encryptedSession,
          telegramUserId: String(me.id),
          telegramUsername: me.username || '',
          displayName: [me.firstName, me.lastName].filter(Boolean).join(' '),
          isActive: true,
          lastActivityAt: new Date(),
          connectedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: false },
    );

    // Clean up auth session
    await PhoneAuthSession.deleteOne({ locationId });

    // Connect the client in the ConnectionManager pool
    await this.connectionManager.connect(locationId, encryptedSession);

    // Register inbound message handler
    this.connectionManager.onNewMessage(locationId, (event) =>
      this.handleInboundUpdate(locationId, event),
    );

    console.log(
      `Phone connected for location ${locationId}: @${me.username || me.id}`,
    );

    return {
      connected: true,
      user: {
        telegramUserId: String(me.id),
        telegramUsername: me.username || '',
        displayName: [me.firstName, me.lastName].filter(Boolean).join(' '),
        phoneNumber,
      },
    };
  }

  // ── Inbound Message Processing ───────────────────────

  async handleInboundUpdate(locationId, event) {
    const message = event.message;
    if (!message) return;

    const chatId = message.chatId || message.peerId?.userId;
    if (!chatId) return;

    const chatIdNum = typeof chatId === 'bigint' ? Number(chatId) : chatId;

    // Step 1: Get sender info early (needed for write-ahead log)
    const sender = await message.getSender();
    const senderInfo = {
      first_name: sender?.firstName || 'Unknown',
      last_name: sender?.lastName || '',
      username: sender?.username || '',
    };

    // Step 2: Write-ahead log (includes sender info for recovery)
    const pendingUpdate = await PendingUpdate.create({
      locationId,
      rawUpdate: JSON.stringify(
        { chatId: chatIdNum, text: message.text, messageId: message.id, sender: senderInfo },
        (key, value) => (typeof value === 'bigint' ? value.toString() : value),
      ),
      status: 'pending',
    });

    try {
      await PendingUpdate.updateOne(
        { _id: pendingUpdate._id },
        { status: 'processing', lastAttemptAt: new Date(), $inc: { attempts: 1 } },
      );

      // Step 3: Normalize to Bot API shape for contactMappingService
      const telegramUser = senderInfo;

      // Step 4: Get or create GHL contact
      const ghlContactId = await this.contactMapping.getOrCreateContact(
        locationId,
        telegramUser,
        chatIdNum,
      );

      // Step 5: Get installation for conversation provider ID
      const installation = await Installation.findOne({ locationId });
      if (!installation) {
        throw new Error(`No installation for location: ${locationId}`);
      }

      // Step 6: Build message content
      let messageText = message.text || message.message || '';

      // Step 7: Handle media attachments
      const attachments = [];
      if (message.media && message.media.className !== 'MessageMediaEmpty') {
        try {
          const buffer = await this.connectionManager.downloadMedia(locationId, message.media);
          if (buffer) {
            const mediaToken = await this._storeMediaTemp(buffer, message.media);
            const mediaUrl = `${process.env.BACKEND_URL}/media/${mediaToken}`;
            attachments.push(mediaUrl);
          }
        } catch (err) {
          console.warn(`Failed to download media for location ${locationId}:`, err.message);
        }
      }

      // Step 8: Forward to GHL
      const result = await this.ghlService.addInboundMessage(locationId, {
        conversationProviderId: installation.conversationProviderId,
        contactId: ghlContactId,
        message: messageText || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        altId: String(chatIdNum),
      });

      // Step 9: Log the message
      await MessageLog.create({
        locationId,
        direction: MessageDirection.INBOUND,
        telegramChatId: chatIdNum,
        ghlMessageId: result.messageId,
        telegramMessageId: message.id,
        status: MessageStatus.DELIVERED,
      });

      // Step 10: Update activity timestamp
      await Installation.updateOne(
        { locationId },
        { 'phoneConfig.lastActivityAt': new Date() },
      );

      // Step 11: Mark write-ahead as completed
      await PendingUpdate.updateOne(
        { _id: pendingUpdate._id },
        { status: 'completed', processedAt: new Date() },
      );

      console.log(
        `Phone inbound synced: chat ${chatIdNum} → GHL message ${result.messageId} (location ${locationId})`,
      );
    } catch (error) {
      console.error(
        `Failed to process phone inbound for location ${locationId}:`,
        error.message,
      );

      const updated = await PendingUpdate.findById(pendingUpdate._id);
      if (updated && updated.attempts >= updated.maxAttempts) {
        await PendingUpdate.updateOne(
          { _id: pendingUpdate._id },
          { status: 'failed', errorMessage: error.message },
        );
      } else {
        await PendingUpdate.updateOne(
          { _id: pendingUpdate._id },
          { status: 'pending', errorMessage: error.message },
        );
      }
    }
  }

  // ── Media Temp Storage ───────────────────────────────

  async _storeMediaTemp(buffer, media) {
    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');

    const token = crypto.randomBytes(16).toString('hex');
    const ext = this._guessExtension(media);
    const filename = `${token}${ext}`;

    const mediaDir = path.join(process.cwd(), 'tmp', 'media');
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    const filePath = path.join(mediaDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Schedule cleanup after 1 hour
    setTimeout(() => {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // file may already be deleted
      }
    }, 60 * 60 * 1000);

    return token + ext;
  }

  _guessExtension(media) {
    if (!media) return '';
    const className = media.className || '';
    if (className.includes('Photo')) return '.jpg';
    if (media.document?.mimeType) {
      const mime = media.document.mimeType;
      if (mime.includes('pdf')) return '.pdf';
      if (mime.includes('png')) return '.png';
      if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
      if (mime.includes('gif')) return '.gif';
      if (mime.includes('webp')) return '.webp';
      if (mime.includes('mp4')) return '.mp4';
    }
    return '';
  }

  // ── Lifecycle ────────────────────────────────────────

  async initAllClients() {
    if (this.disabled) return;

    await this.connectionManager.initAllClients();

    // Register message handlers for all connected clients
    for (const [locationId] of this.connectionManager.clients) {
      this.connectionManager.onNewMessage(locationId, (event) =>
        this.handleInboundUpdate(locationId, event),
      );
    }

    // Recover any pending updates from before the restart
    await this.recoverPendingUpdates();
  }

  async recoverPendingUpdates() {
    const pending = await PendingUpdate.find({
      status: { $in: ['pending', 'processing'] },
      $expr: { $lt: ['$attempts', '$maxAttempts'] },
    }).sort({ createdAt: 1 });

    if (pending.length === 0) return;

    console.log(`Recovering ${pending.length} pending updates...`);

    for (const update of pending) {
      try {
        const parsed = JSON.parse(update.rawUpdate);
        await PendingUpdate.updateOne(
          { _id: update._id },
          { status: 'processing', lastAttemptAt: new Date(), $inc: { attempts: 1 } },
        );

        const installation = await Installation.findOne({ locationId: update.locationId });
        if (!installation) {
          await PendingUpdate.updateOne(
            { _id: update._id },
            { status: 'failed', errorMessage: 'Installation not found' },
          );
          continue;
        }

        // Re-forward to GHL using stored data (sender info preserved in rawUpdate)
        const senderInfo = parsed.sender || { first_name: 'Telegram User', last_name: '', username: '' };
        const ghlContactId = await this.contactMapping.getOrCreateContact(
          update.locationId,
          senderInfo,
          parsed.chatId,
        );

        await this.ghlService.addInboundMessage(update.locationId, {
          conversationProviderId: installation.conversationProviderId,
          contactId: ghlContactId,
          message: parsed.text || undefined,
          altId: String(parsed.chatId),
        });

        await PendingUpdate.updateOne(
          { _id: update._id },
          { status: 'completed', processedAt: new Date() },
        );
      } catch (error) {
        console.error(`Failed to recover update ${update._id}:`, error.message);
        const current = await PendingUpdate.findById(update._id);
        if (current && current.attempts >= current.maxAttempts) {
          await PendingUpdate.updateOne(
            { _id: update._id },
            { status: 'failed', errorMessage: error.message },
          );
        }
      }
    }
  }

  async destroyClient(locationId) {
    await this.connectionManager.disconnect(locationId);
  }
}

module.exports = GramJsService;
```

- [ ] **Step 2: Verify the module loads**

```bash
cd backend && node -e "require('./src/telegram/gramjs.service')"
```

Expected: No errors, clean exit.

- [ ] **Step 3: Commit**

```bash
git add backend/src/telegram/gramjs.service.js
git commit -m "feat: add GramJsService with phone auth flow and inbound processing"
```

---

## Chunk 3: Router Changes & Media Proxy

### Task 7: Create media proxy router

**Files:**
- Create: `backend/src/media/media.router.js`

- [ ] **Step 1: Create the media router**

```js
const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const MEDIA_DIR = path.join(process.cwd(), 'tmp', 'media');
const MEDIA_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function createMediaRouter() {
  const router = Router();

  // Rate limiting to prevent abuse
  const mediaLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });
  router.use(mediaLimiter);

  // GET /media/:filename — serves temporary media files
  router.get('/:filename', (req, res) => {
    const { filename } = req.params;

    // Sanitize filename to prevent path traversal
    const sanitized = path.basename(filename);
    const filePath = path.join(MEDIA_DIR, sanitized);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    // Determine content type from extension
    const ext = path.extname(sanitized).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });

  return router;
}

// Clean up expired media files (called on startup and every 30 minutes)
function cleanupExpiredMedia() {
  if (!fs.existsSync(MEDIA_DIR)) return;

  const now = Date.now();
  try {
    const files = fs.readdirSync(MEDIA_DIR);
    for (const file of files) {
      const filePath = path.join(MEDIA_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > MEDIA_MAX_AGE_MS) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.warn('Media cleanup error:', err.message);
  }
}

module.exports = { createMediaRouter, cleanupExpiredMedia };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/media/media.router.js
git commit -m "feat: add media proxy router for GramJS downloaded files"
```

---

### Task 8: Add phone auth endpoints to settings router

**Files:**
- Modify: `backend/src/settings/settings.router.js`

- [ ] **Step 1: Update createSettingsRouter to accept gramJsService and add phone endpoints**

Replace the entire function signature and add new routes after the existing ones in `backend/src/settings/settings.router.js`:

Change the function signature from:
```js
function createSettingsRouter(settingsService, ssoMiddleware) {
```
to:
```js
function createSettingsRouter(settingsService, gramJsService, ssoMiddleware) {
```

Add a per-location rate limiter for phone auth at the top of the function (after `const router = Router();`):

```js
  const phoneAuthLimiter = require('express-rate-limit').rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 3,
    keyGenerator: (req) => req.params.locationId,
    message: { error: 'Too many code requests. Please wait before trying again.' },
  });
```

Add these routes before `return router;`:

```js
  // ── Phone Auth Endpoints ──────────────────────────────

  // POST /settings/:locationId/phone/send-code
  router.post('/:locationId/phone/send-code', phoneAuthLimiter, async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({ error: 'phoneNumber is required and must be a string' });
    }

    // Basic phone number validation (E.164 format)
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber.trim())) {
      return res.status(400).json({
        error: 'Invalid phone number format. Use international format: +1234567890',
      });
    }

    try {
      const result = await gramJsService.sendCode(req.params.locationId, phoneNumber.trim());
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // POST /settings/:locationId/phone/verify-code
  router.post('/:locationId/phone/verify-code', async (req, res) => {
    const { phoneCode } = req.body;
    if (!phoneCode || typeof phoneCode !== 'string') {
      return res.status(400).json({ error: 'phoneCode is required and must be a string' });
    }

    try {
      const result = await gramJsService.verifyCode(req.params.locationId, phoneCode.trim());
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // POST /settings/:locationId/phone/verify-2fa
  router.post('/:locationId/phone/verify-2fa', async (req, res) => {
    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password is required and must be a string' });
    }

    try {
      const result = await gramJsService.submit2FA(req.params.locationId, password);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // DELETE /settings/:locationId/phone/disconnect
  router.delete('/:locationId/phone/disconnect', async (req, res) => {
    try {
      const locationId = req.params.locationId;

      // Destroy GramJS client
      await gramJsService.destroyClient(locationId);

      // Clear phone config and reset to bot mode
      await Installation.updateOne(
        { locationId },
        {
          connectionType: 'bot',
          phoneConfig: null,
        },
      );

      // Clean up any pending auth sessions
      await PhoneAuthSession.deleteOne({ locationId });

      console.log(`Phone disconnected for location: ${locationId}`);
      res.json({ connected: false, connectionType: 'bot' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });
```

- [ ] **Step 2: Replace the existing GET /:locationId handler to include connectionType**

**Important:** Find the EXISTING `router.get('/:locationId', ...)` handler (lines 9-16 in the current file) and REPLACE its entire body. Do NOT add a second route — replace the existing one.

Add requires at the top of the file (after `const { Router } = require('express');`):

```js
const Installation = require('../schemas/installation.schema');
const PhoneAuthSession = require('../schemas/phone-auth-session.schema');
```

Then replace the existing handler with:

```js
  router.get('/:locationId', async (req, res) => {
    try {
      // Check for phone connection first
      const installation = await Installation.findOne({ locationId: req.params.locationId });

      if (installation?.connectionType === 'phone' && installation.phoneConfig) {
        return res.json({
          connectionType: 'phone',
          connected: installation.phoneConfig.isActive,
          phone: {
            phoneNumber: installation.phoneConfig.phoneNumber,
            telegramUsername: installation.phoneConfig.telegramUsername,
            displayName: installation.phoneConfig.displayName,
            isActive: installation.phoneConfig.isActive,
            connectedAt: installation.phoneConfig.connectedAt,
          },
        });
      }

      // Default: bot connection (existing flow)
      const result = await settingsService.getConfig(req.params.locationId);
      res.json({ connectionType: 'bot', ...result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/settings/settings.router.js
git commit -m "feat: add phone auth endpoints and connectionType to settings router"
```

---

### Task 9: Update webhooks router for phone outbound and uninstall

**Files:**
- Modify: `backend/src/webhooks/webhooks.router.js`

- [ ] **Step 1: Update function signature**

Add `PhoneAuthSession` to the top-level requires (after the existing requires at lines 1-6):

```js
const PhoneAuthSession = require('../schemas/phone-auth-session.schema');
```

Change `createWebhooksRouter` signature from:
```js
function createWebhooksRouter(settingsService, telegramService, ghlService, contactMappingService) {
```
to:
```js
function createWebhooksRouter(settingsService, telegramService, ghlService, contactMappingService, connectionManager) {
```

- [ ] **Step 2: Update the outbound handler to check connectionType**

In the `POST /ghl-outbound` handler, **replace the entire section from `// Step 2: Get the bot token` (line 158) through the end of the attachment sending loop (line 195)**. The new code checks `connectionType` BEFORE attempting to get a bot token, so phone connections don't hit the "No active bot" error:

```js
      // Step 2: Check connection type and send via appropriate transport
      const installation = await Installation.findOne({ locationId });
      const isPhone = installation?.connectionType === 'phone';

      let telegramMessageId;

      if (isPhone) {
        // Phone connection — use ConnectionManager (GramJS)
        if (message) {
          telegramMessageId = await connectionManager.sendMessage(
            locationId,
            telegramChatId,
            message,
          );
        }

        if (attachments && attachments.length > 0) {
          for (const attachmentUrl of attachments) {
            const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(attachmentUrl);
            if (isImage) {
              telegramMessageId = await connectionManager.sendPhoto(
                locationId,
                telegramChatId,
                attachmentUrl,
              );
            } else {
              telegramMessageId = await connectionManager.sendDocument(
                locationId,
                telegramChatId,
                attachmentUrl,
              );
            }
          }
        }

        // Update activity timestamp
        await Installation.updateOne(
          { locationId },
          { 'phoneConfig.lastActivityAt': new Date() },
        );
      } else {
        // Bot connection — existing flow (fetch bot token here, not earlier)
        const botToken = await settingsService.getBotToken(locationId);
        if (!botToken) {
          console.error(`No active bot for location: ${locationId}`);
          await ghlService.updateMessageStatus(locationId, messageId, 'failed', 'No Telegram bot configured');
          return res.json({ ok: false });
        }

        if (message) {
          telegramMessageId = await telegramService.sendMessage(botToken, telegramChatId, message);
        }

        if (attachments && attachments.length > 0) {
          for (const attachmentUrl of attachments) {
            const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(attachmentUrl);
            if (isImage) {
              telegramMessageId = await telegramService.sendPhoto(botToken, telegramChatId, attachmentUrl);
            } else {
              telegramMessageId = await telegramService.sendDocument(botToken, telegramChatId, attachmentUrl);
            }
          }
        }
      }
```

- [ ] **Step 3: Update handleAppUninstall for phone cleanup**

Add `connectionManager` parameter to `handleAppUninstall` and add phone cleanup:

Change the call from:
```js
return await handleAppUninstall(req.body, settingsService, telegramService, res);
```
to:
```js
return await handleAppUninstall(req.body, settingsService, telegramService, connectionManager, res);
```

Update the function signature:
```js
async function handleAppUninstall(payload, settingsService, telegramService, connectionManager, res) {
```

Add phone cleanup inside the `if (installation)` block, after the existing bot cleanup:

```js
      // Clean up phone connection if active
      if (installation.connectionType === 'phone') {
        try {
          await connectionManager.disconnect(locationId);
        } catch (err) {
          console.warn(`Failed to disconnect phone for ${locationId}:`, err.message);
        }
        await Installation.updateOne({ locationId }, { phoneConfig: null });
      }

      // Clean up any pending phone auth sessions
      await PhoneAuthSession.deleteOne({ locationId });
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/webhooks/webhooks.router.js
git commit -m "feat: add phone outbound support and uninstall cleanup to webhooks router"
```

---

### Task 10: Update main.js bootstrap

**Files:**
- Modify: `backend/src/main.js`

- [ ] **Step 1: Add ConnectionManager and GramJsService instantiation**

Add after the existing service requires (around line 16):

```js
const ConnectionManager = require('./telegram/connection-manager');
const GramJsService = require('./telegram/gramjs.service');
```

Add after `const referralService = new ReferralService();` (around line 40):

```js
  const connectionManager = new ConnectionManager(cryptoService);
  const gramJsService = new GramJsService(
    connectionManager,
    cryptoService,
    ghlService,
    contactMappingService,
    telegramService,
  );
```

- [ ] **Step 2: Update router factory calls**

Change settings router from:
```js
  app.use('/settings', createSettingsRouter(settingsService, ssoMiddleware));
```
to:
```js
  app.use('/settings', createSettingsRouter(settingsService, gramJsService, ssoMiddleware));
```

Change webhooks router from:
```js
  app.use(
    '/webhooks',
    webhookLimiter,
    createWebhooksRouter(settingsService, telegramService, ghlService, contactMappingService),
  );
```
to:
```js
  app.use(
    '/webhooks',
    webhookLimiter,
    createWebhooksRouter(settingsService, telegramService, ghlService, contactMappingService, connectionManager),
  );
```

- [ ] **Step 3: Add media router**

Add to the requires at the top:
```js
const { createMediaRouter, cleanupExpiredMedia } = require('./media/media.router');
```

Add after the other `app.use` mounts:
```js
  app.use('/media', createMediaRouter());

  // Clean up expired media files on startup and every 30 minutes
  cleanupExpiredMedia();
  setInterval(cleanupExpiredMedia, 30 * 60 * 1000);
```

- [ ] **Step 4: Initialize phone connections and add graceful shutdown**

Add after all `app.use` mounts but before the error handler:

```js
  // Initialize phone connections (staggered reconnect)
  gramJsService.initAllClients().catch((err) => {
    console.error('Failed to initialize phone connections:', err);
  });
```

Add before `app.listen`:

```js
  // Graceful shutdown — disconnect all GramJS clients
  const shutdown = async () => {
    console.log('Shutting down — disconnecting GramJS clients...');
    await connectionManager.disconnectAll();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
```

- [ ] **Step 5: Verify backend starts**

```bash
cd backend && node src/main.js
```

Expected: Server starts, prints warning about missing TELEGRAM_API_ID/TELEGRAM_API_HASH (unless set), and "Phone login disabled — skipping GramJS client initialization".

- [ ] **Step 6: Commit**

```bash
git add backend/src/main.js
git commit -m "feat: wire ConnectionManager, GramJsService, and media router into main bootstrap"
```

---

## Chunk 4: Frontend Changes

### Task 11: Update frontend App.jsx with connection type selector and phone auth flow

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Update the API mock to handle phone endpoints**

In the `api.mockCall` method, add phone endpoint mocks before the `// GET config` fallback:

```js
    if (path.includes('/phone/send-code')) {
      return { success: true, data: { phoneCodeHash: 'mock_hash_123' } };
    }

    if (path.includes('/phone/verify-code')) {
      return {
        success: true,
        data: {
          connected: true,
          user: {
            telegramUserId: '123456789',
            telegramUsername: 'JohnFromAcme',
            displayName: 'John Smith',
            phoneNumber: body?.phoneNumber || '+1234567890',
          },
        },
      };
    }

    if (path.includes('/phone/verify-2fa')) {
      return {
        success: true,
        data: {
          connected: true,
          user: {
            telegramUserId: '123456789',
            telegramUsername: 'JohnFromAcme',
            displayName: 'John Smith',
            phoneNumber: '+1234567890',
          },
        },
      };
    }

    if (path.includes('/phone/disconnect')) {
      return { connected: false, connectionType: 'bot' };
    }
```

Update the mock GET config return to include `connectionType`:

```js
    // GET config
    return { connectionType: 'bot', connected: false, bot: null };
```

- [ ] **Step 2: Add PhoneIcon component**

Add after the existing icon components:

```js
function PhoneIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"
        stroke="#6B7280"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Add phone auth state and handlers to the App component**

Add these state variables after the existing ones in `App()`:

```js
  const [connectionType, setConnectionType] = useState(null); // null | 'bot' | 'phone'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [phoneStep, setPhoneStep] = useState('input'); // input | code | 2fa | connecting
  const [phoneInfo, setPhoneInfo] = useState(null);
```

Update the `fetchConfig` in the `useEffect` to handle connectionType:

```js
    const fetchConfig = async () => {
      try {
        const config = await api.call('GET', `/settings/${user.locationId}`, ssoPayload);
        if (config.connectionType === 'phone' && config.connected && config.phone) {
          setPhoneInfo(config.phone);
          setConnectionType('phone');
          setAppState('connected');
        } else if (config.connected && config.bot) {
          setBotInfo(config.bot);
          setConnectionType('bot');
          setAppState('connected');
        } else {
          setAppState('disconnected');
        }
      } catch (err) {
        setAppState('disconnected');
      }
    };
```

Update the existing `handleDisconnect` function to also reset `connectionType`:

After `setBotToken('');` add:
```js
    setConnectionType(null);
```

Add phone auth handlers:

```js
  // ── Phone auth handlers ──────────────────────────────
  const handleSendCode = async () => {
    if (!phoneNumber.trim() || !/^\+[1-9]\d{6,14}$/.test(phoneNumber.trim())) {
      setErrorMsg('Please enter a valid phone number in international format (+1234567890)');
      return;
    }
    setErrorMsg('');
    setPhoneStep('connecting');
    try {
      await api.call('POST', `/settings/${user.locationId}/phone/send-code`, ssoPayload, {
        phoneNumber: phoneNumber.trim(),
      });
      setPhoneStep('code');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send code');
      setPhoneStep('input');
    }
  };

  const handleVerifyCode = async () => {
    if (!phoneCode.trim()) {
      setErrorMsg('Please enter the verification code');
      return;
    }
    setErrorMsg('');
    setPhoneStep('connecting');
    try {
      const result = await api.call(
        'POST',
        `/settings/${user.locationId}/phone/verify-code`,
        ssoPayload,
        { phoneCode: phoneCode.trim() },
      );
      if (result.data?.require2FA) {
        setPhoneStep('2fa');
      } else if (result.data?.connected) {
        setPhoneInfo(result.data.user);
        setConnectionType('phone');
        setAppState('connected');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Invalid code');
      setPhoneStep('code');
    }
  };

  const handleVerify2FA = async () => {
    if (!twoFaPassword.trim()) {
      setErrorMsg('Please enter your 2FA password');
      return;
    }
    setErrorMsg('');
    setPhoneStep('connecting');
    try {
      const result = await api.call(
        'POST',
        `/settings/${user.locationId}/phone/verify-2fa`,
        ssoPayload,
        { password: twoFaPassword },
      );
      if (result.data?.connected) {
        setPhoneInfo(result.data.user);
        setConnectionType('phone');
        setAppState('connected');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Incorrect password');
      setPhoneStep('2fa');
    }
  };

  const handlePhoneDisconnect = async () => {
    setShowDisconnectConfirm(false);
    try {
      await api.call('DELETE', `/settings/${user.locationId}/phone/disconnect`, ssoPayload);
    } catch (err) {
      console.error('Phone disconnect failed:', err);
    }
    setAppState('disconnected');
    setPhoneInfo(null);
    setConnectionType(null);
    setPhoneNumber('');
    setPhoneCode('');
    setTwoFaPassword('');
    setPhoneStep('input');
  };
```

- [ ] **Step 4: Add the connection type selector UI (disconnected state)**

Replace the disconnected state return (the final `return` block starting with `<div style={styles.container}>`) to include a connection type chooser. Before the setup card, add:

```js
      {/* Connection Type Selector */}
      {!connectionType && (
        <div style={styles.typeSelector}>
          <h2 style={styles.setupTitle}>Choose Connection Type</h2>
          <p style={styles.setupDescription}>
            Select how you want to connect Telegram to this location.
          </p>
          <div style={styles.typeTiles}>
            <button style={styles.typeTile} onClick={() => setConnectionType('bot')}>
              <TelegramIcon size={28} />
              <div style={styles.typeTileTitle}>Telegram Bot</div>
              <div style={styles.typeTileDesc}>
                Create a bot via @BotFather. Customers message the bot.
              </div>
            </button>
            <button style={styles.typeTile} onClick={() => setConnectionType('phone')}>
              <PhoneIcon size={28} />
              <div style={styles.typeTileTitle}>Phone Number</div>
              <div style={styles.typeTileDesc}>
                Connect your Telegram account. Customers message you directly.
              </div>
            </button>
          </div>
        </div>
      )}
```

Wrap the existing bot setup card with `{connectionType === 'bot' && ( ... )}`.

Add the phone auth form:

```js
      {connectionType === 'phone' && (
        <div style={styles.setupCard}>
          <button style={styles.backBtn} onClick={() => { setConnectionType(null); setErrorMsg(''); setPhoneStep('input'); }}>
            ← Back
          </button>
          <h2 style={styles.setupTitle}>Connect Phone Number</h2>

          {phoneStep === 'input' && (
            <>
              <p style={styles.setupDescription}>
                Enter your Telegram phone number. We'll send a verification code to your Telegram app.
              </p>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Phone Number</label>
                <input
                  style={{ ...styles.input, ...(errorMsg ? { borderColor: '#EF4444' } : {}), paddingRight: 14 }}
                  type="tel"
                  placeholder="+1234567890"
                  value={phoneNumber}
                  onChange={(e) => { setPhoneNumber(e.target.value); setErrorMsg(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode(); }}
                />
                {errorMsg && <div style={styles.errorMsg}><AlertCircle /><span>{errorMsg}</span></div>}
              </div>
              <button style={styles.primaryBtn} onClick={handleSendCode}>Send Code</button>
            </>
          )}

          {phoneStep === 'code' && (
            <>
              <p style={styles.setupDescription}>
                Enter the code sent to your Telegram app for <strong>{phoneNumber}</strong>.
              </p>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Verification Code</label>
                <input
                  style={{ ...styles.input, ...(errorMsg ? { borderColor: '#EF4444' } : {}), paddingRight: 14 }}
                  type="text"
                  placeholder="12345"
                  value={phoneCode}
                  onChange={(e) => { setPhoneCode(e.target.value); setErrorMsg(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyCode(); }}
                  autoFocus
                />
                {errorMsg && <div style={styles.errorMsg}><AlertCircle /><span>{errorMsg}</span></div>}
              </div>
              <button style={styles.primaryBtn} onClick={handleVerifyCode}>Verify Code</button>
            </>
          )}

          {phoneStep === '2fa' && (
            <>
              <p style={styles.setupDescription}>
                Your account has two-factor authentication. Enter your cloud password.
              </p>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>2FA Password</label>
                <input
                  style={{ ...styles.input, ...(errorMsg ? { borderColor: '#EF4444' } : {}), paddingRight: 14 }}
                  type="password"
                  placeholder="Your cloud password"
                  value={twoFaPassword}
                  onChange={(e) => { setTwoFaPassword(e.target.value); setErrorMsg(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleVerify2FA(); }}
                  autoFocus
                />
                {errorMsg && <div style={styles.errorMsg}><AlertCircle /><span>{errorMsg}</span></div>}
              </div>
              <button style={styles.primaryBtn} onClick={handleVerify2FA}>Submit Password</button>
            </>
          )}

          {phoneStep === 'connecting' && (
            <div style={styles.loadingWrapper}>
              <Loader />
              <p style={styles.loadingText}>Connecting...</p>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 5: Add phone connected state to the connected view**

In the connected state render block (`if (appState === 'connected')`), add a check for phone:

After `if (appState === 'connected' && botInfo) {`, add an alternative for phone:

```js
  if (appState === 'connected' && connectionType === 'phone' && phoneInfo) {
    const maskedPhone = phoneInfo.phoneNumber
      ? phoneInfo.phoneNumber.slice(0, 4) + ' ***-***-' + phoneInfo.phoneNumber.slice(-4)
      : 'Connected';

    return (
      <div style={styles.container}>
        <DevBanner user={user} />
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.logoWrapper}><TelegramIcon size={32} /></div>
            <div>
              <h1 style={styles.title}>TeleSync</h1>
              <p style={styles.subtitle}>Telegram integration for GoHighLevel</p>
            </div>
          </div>
          <div style={styles.statusBadge}><span style={styles.statusDot} />Connected</div>
        </div>

        <div style={styles.connectedCard}>
          <div style={styles.connectedHeader}>
            <CheckCircle />
            <span style={styles.connectedTitle}>Phone Number Connected</span>
          </div>
          <div style={styles.botInfoGrid}>
            <div style={styles.botInfoItem}>
              <span style={styles.botInfoLabel}>Phone</span>
              <span style={styles.botInfoValue}>{maskedPhone}</span>
            </div>
            <div style={styles.botInfoItem}>
              <span style={styles.botInfoLabel}>Username</span>
              <span style={styles.botInfoValue}>
                {phoneInfo.telegramUsername ? `@${phoneInfo.telegramUsername}` : 'N/A'}
              </span>
            </div>
            <div style={styles.botInfoItem}>
              <span style={styles.botInfoLabel}>Name</span>
              <span style={styles.botInfoValue}>{phoneInfo.displayName || 'N/A'}</span>
            </div>
            <div style={styles.botInfoItem}>
              <span style={styles.botInfoLabel}>Status</span>
              <span style={{ ...styles.botInfoValue, color: '#22C55E' }}>Active</span>
            </div>
          </div>
          <div style={styles.connectedNote}>
            <PhoneIcon size={16} />
            <span>
              Private messages sent to your Telegram account will appear in your GHL Conversations tab.
            </span>
          </div>
          <div style={styles.connectedActions}>
            {phoneInfo.telegramUsername && (
              <button
                style={styles.ghostBtn}
                onClick={() => window.open(`https://t.me/${phoneInfo.telegramUsername}`, '_blank')}
              >
                Open in Telegram <ExternalLink />
              </button>
            )}
            <button style={styles.dangerBtn} onClick={() => setShowDisconnectConfirm(true)}>
              Disconnect Phone
            </button>
          </div>
        </div>

        {showDisconnectConfirm && (
          <div style={styles.modalOverlay}>
            <div style={styles.modal}>
              <h3 style={styles.modalTitle}>Disconnect Phone Number?</h3>
              <p style={styles.modalText}>
                This will stop syncing messages between your Telegram account and GoHighLevel for this location.
              </p>
              <div style={styles.modalActions}>
                <button style={styles.secondaryBtn} onClick={() => setShowDisconnectConfirm(false)}>Cancel</button>
                <button style={styles.dangerBtn} onClick={handlePhoneDisconnect}>Yes, Disconnect</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
```

- [ ] **Step 6: Add new styles**

Add to the `styles` object:

```js
  // Type selector
  typeSelector: {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 16,
    padding: '28px 28px 24px',
    marginBottom: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  typeTiles: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginTop: 16,
  },
  typeTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: 24,
    background: '#F9FAFB',
    border: '2px solid #E5E7EB',
    borderRadius: 12,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'border-color 0.15s, background 0.15s',
  },
  typeTileTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#111827',
  },
  typeTileDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 1.5,
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: '#6B7280',
    fontWeight: 500,
    marginBottom: 12,
  },
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add phone number connection UI with multi-step auth flow"
```

---

## Chunk 5: Integration & Verification

### Task 12: Add .gitignore entry for tmp media directory

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add tmp directory to .gitignore**

Add to `.gitignore`:
```
# Temporary media files
tmp/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add tmp/ to gitignore for temporary media storage"
```

---

### Task 13: End-to-end verification

- [ ] **Step 1: Verify backend starts cleanly**

```bash
cd backend && node src/main.js
```

Expected: Server starts on configured port. Prints "Phone login disabled" warning (without env vars) or "No active phone connections to restore" (with env vars). No errors.

- [ ] **Step 2: Verify frontend dev mode works**

```bash
cd frontend && npm run dev
```

Expected: Vite dev server starts. Opening in browser shows the connection type selector (two tiles: "Telegram Bot" and "Phone Number").

- [ ] **Step 3: Verify bot flow is unchanged**

In dev mode:
1. Click "Telegram Bot" tile
2. Enter a mock bot token matching `123456789:ABCdefGHIjklMNOpqrsTUVwxyz12345678901`
3. Click "Connect Bot"

Expected: Bot connects as before. No regressions.

- [ ] **Step 4: Verify phone flow in dev mode**

In dev mode:
1. Click "Phone Number" tile
2. Enter `+1234567890`
3. Click "Send Code"
4. Enter any code (mock accepts all)
5. Verify connected state shows phone info

Expected: Phone connected state displays with masked phone number, username, display name.

- [ ] **Step 5: Verify phone disconnect**

Click "Disconnect Phone" → confirm → should return to connection type selector.

- [ ] **Step 6: Verify working tree is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. All changes were committed in previous tasks. If there are uncommitted files, investigate what was missed rather than doing a blanket `git add -A`.
