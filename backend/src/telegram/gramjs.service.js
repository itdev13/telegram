const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { computeCheck } = require('telegram/Password');
const Installation = require('../schemas/installation.schema');
const PhoneAuthSession = require('../schemas/phone-auth-session.schema');
const PendingUpdate = require('../schemas/pending-update.schema');
const { MessageLog, MessageDirection, MessageStatus } = require('../schemas/message-log.schema');

class GramJsService {
  constructor(connectionManager, cryptoService, ghlService, contactMappingService, telegramService, workflowsService) {
    this.connectionManager = connectionManager;
    this.crypto = cryptoService;
    this.ghlService = ghlService;
    this.contactMapping = contactMappingService;
    this.telegramService = telegramService;
    this.workflows = workflowsService;

    const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
    const apiHash = process.env.TELEGRAM_API_HASH;
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.disabled = !apiId || !apiHash;
  }

  // ── Auth Flow ────────────────────────────────────────

  async sendCode(locationId, phoneNumber, { confirmTransfer = false } = {}) {
    if (this.disabled) throw new Error('Phone login is not configured');

    // Conflict check: is this phone already connected to a different location?
    // If so, require explicit user confirmation before sending the OTP. We'll
    // disconnect the old location's client during _completeAuth.
    const existing = await Installation.findOne({
      locationId: { $ne: locationId },
      'phoneConfig.phoneNumber': phoneNumber,
      'phoneConfig.isActive': true,
      status: 'active',
    }).select('locationId phoneConfig.phoneNumber phoneConfig.displayName phoneConfig.telegramUsername').lean();

    if (existing && !confirmTransfer) {
      const err = new Error('This Telegram number is already connected to another sub-account.');
      err.statusCode = 409;
      err.code = 'PHONE_ALREADY_CONNECTED';
      err.details = {
        requiresTransfer: true,
        fromLocationId: existing.locationId,
        displayName: existing.phoneConfig?.displayName || '',
        telegramUsername: existing.phoneConfig?.telegramUsername || '',
        phoneNumber,
      };
      throw err;
    }

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
        transferFromLocationId: existing ? existing.locationId : null,
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
    // Read transfer intent before we delete the auth session below.
    const authSession = await PhoneAuthSession.findOne({ locationId }).select('transferFromLocationId').lean();
    const transferFromLocationId = authSession?.transferFromLocationId || null;

    const me = await client.getMe();
    const finalSession = client.session.save();
    const encryptedSession = this.crypto.encrypt(finalSession);

    // Destroy the auth client BEFORE ConnectionManager creates a new one
    // (two clients sharing the same auth key causes AUTH_KEY_DUPLICATED)
    await client.destroy();

    // Transfer: disconnect the previous location's GramJS client and clear its phoneConfig
    // so the same Telegram account isn't running on two locations simultaneously.
    if (transferFromLocationId && transferFromLocationId !== locationId) {
      try {
        await this.connectionManager.disconnect(transferFromLocationId);
      } catch (err) {
        console.error(`[Phone] Failed to disconnect old location ${transferFromLocationId} during transfer: ${err.message}`);
      }
      await Installation.updateOne(
        { locationId: transferFromLocationId },
        { $set: { phoneConfig: null, connectionType: 'bot' } },
      );
      console.log(`[Phone] Transferred number ${phoneNumber} from location ${transferFromLocationId} → ${locationId}`);
    }

    // Save phone config to Installation (preserve existing bot connection)
    await Installation.findOneAndUpdate(
      { locationId },
      {
        connectionType: 'phone',
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

    console.log(`Phone connected for location ${locationId}: @${me.username || me.id}`);

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

      // Dedup: skip if this Telegram message id was already processed (bot webhook may have handled it)
      const alreadyProcessed = await MessageLog.findOne({
        locationId,
        telegramMessageId: message.id,
        direction: MessageDirection.INBOUND,
      });
      if (alreadyProcessed) {
        console.log(`Duplicate phone inbound message ${message.id} for location ${locationId}, skipping`);
        await PendingUpdate.updateOne(
          { _id: pendingUpdate._id },
          { status: 'completed', processedAt: new Date() },
        );
        return;
      }

      // Step 3: Normalize to Bot API shape for contactMappingService
      const telegramUser = senderInfo;

      // Step 4: Get or create GHL contact
      const { ghlContactId, isNew: isNewContact } = await this.contactMapping.getOrCreateContact(
        locationId,
        telegramUser,
        chatIdNum,
        'phone',
      );

      // Step 5: Get installation for conversation provider ID
      const installation = await Installation.findOne({ locationId });
      if (!installation) {
        throw new Error(`No installation for location: ${locationId}`);
      }

      // Step 6: Build message content
      const messageText = message.text || message.message || '';

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

      // Step 10: Update activity timestamp (skip if phoneConfig is null/missing — happens when phone disconnected mid-flight)
      await Installation.updateOne(
        { locationId, phoneConfig: { $ne: null } },
        { $set: { 'phoneConfig.lastActivityAt': new Date() } },
      );

      // Step 11: Mark write-ahead as completed
      await PendingUpdate.updateOne(
        { _id: pendingUpdate._id },
        { status: 'completed', processedAt: new Date() },
      );

      console.log(
        `Phone inbound synced: chat ${chatIdNum} → GHL message ${result.messageId} (location ${locationId})`,
      );

      // Step 12: Fire workflow triggers (fire-and-forget)
      if (this.workflows) {
        const triggerPayload = {
          contactId: ghlContactId,
          telegramChatId: chatIdNum,
          telegramUsername: telegramUser.username || '',
          telegramFirstName: telegramUser.first_name,
          messageText: messageText,
          messageType: message.media ? 'photo' : 'text',
          telegramMessageId: message.id,
          timestamp: new Date().toISOString(),
        };

        console.log(`[Workflows] Firing telegram_message_received for location ${locationId} (phone)`);
        this.workflows
          .fireTrigger('telegram_message_received', locationId, triggerPayload)
          .catch((err) => console.error(`[Workflows] Failed to fire message trigger: ${err.message}`));

        if (isNewContact) {
          console.log(`[Workflows] Firing new_telegram_contact for location ${locationId} (phone)`);
          this.workflows
            .fireTrigger('new_telegram_contact', locationId, triggerPayload)
            .catch((err) => console.error(`[Workflows] Failed to fire new contact trigger: ${err.message}`));
        }
      }
    } catch (error) {
      const code = error.code || error.codeName;
      const status = error.response?.status;
      const ghlMsg = error.response?.data?.message || error.response?.data?.error;
      console.error(
        `Failed to process phone inbound for location ${locationId}\n` +
        `  Step: ${error._step || 'unknown'}\n` +
        `  Type: ${error.name || 'Error'}${code ? ` (${code})` : ''}${status ? ` [HTTP ${status}]` : ''}\n` +
        `  Message: ${ghlMsg || error.message}\n` +
        `  Stack: ${error.stack?.split('\n').slice(0, 3).join(' | ')}`
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

    // Find every location with an active phone session so we can eagerly reconnect.
    // Why: MTProto updates only flow over a live connection. Lazy-on-first-outbound means
    // inbound messages stay dead until the user happens to send something — unacceptable UX.
    const installations = await Installation.find({
      'phoneConfig.isActive': true,
      'phoneConfig.sessionString': { $exists: true, $ne: '' },
    }).select('locationId phoneConfig.sessionString');

    if (installations.length === 0) {
      console.log('No active phone connections to restore');
      await this.recoverPendingUpdates();
      return;
    }

    console.log(`${installations.length} phone connection(s) found — reconnecting with stagger...`);

    // Stagger between connects to avoid Telegram rate limits on datacenter handshakes.
    const STAGGER_MS = 1500;
    for (const installation of installations) {
      const locationId = installation.locationId;

      // Register the inbound handler BEFORE connect() so _registerEventHandler finds it.
      this.connectionManager.onNewMessage(locationId, (event) =>
        this.handleInboundUpdate(locationId, event),
      );

      try {
        await this.connectionManager.connect(locationId, installation.phoneConfig.sessionString);
      } catch (err) {
        console.error(`[Startup] Failed to reconnect phone for ${locationId}: ${err.message}`);
      }

      await new Promise((r) => setTimeout(r, STAGGER_MS));
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
        const senderInfo = parsed.sender || {
          first_name: 'Telegram User',
          last_name: '',
          username: '',
        };
        const { ghlContactId } = await this.contactMapping.getOrCreateContact(
          update.locationId,
          senderInfo,
          parsed.chatId,
          'phone',
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
