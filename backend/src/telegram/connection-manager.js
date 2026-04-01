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
      console.log(`GramJS connected for location ${locationId}: @${me.username || me.id}`);

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
        await Installation.updateOne({ locationId }, { 'phoneConfig.isActive': false });
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
              console.warn(`FLOOD_WAIT for ${inst.locationId}: waiting ${seconds}s`);
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
