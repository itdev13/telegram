const { TelegramClient, Api } = require('telegram');
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

  // Check if a phone connection exists (in memory OR in database)
  async hasPhoneConfig(locationId) {
    if (this.isConnected(locationId)) return true;
    const inst = await Installation.findOne({
      locationId,
      'phoneConfig.isActive': true,
      'phoneConfig.sessionString': { $exists: true, $ne: '' },
    }).lean();
    return !!inst;
  }

  // ── Messaging ────────────────────────────────────────

  async sendMessage(locationId, chatId, text) {
    const client = await this._getClientOrThrow(locationId);
    const result = await client.sendMessage(chatId, { message: text });
    return result.id;
  }

  async sendPhoto(locationId, chatId, photoUrl, caption) {
    const client = await this._getClientOrThrow(locationId);
    const result = await client.sendMessage(chatId, {
      file: photoUrl,
      message: caption || '',
    });
    return result.id;
  }

  async sendDocument(locationId, chatId, documentUrl, caption) {
    const client = await this._getClientOrThrow(locationId);
    const result = await client.sendMessage(chatId, {
      file: documentUrl,
      message: caption || '',
      forceDocument: true,
    });
    return result.id;
  }

  async downloadMedia(locationId, media) {
    const client = await this._getClientOrThrow(locationId);
    return client.downloadMedia(media);
  }

  // ── Advanced Methods ───────────────────────────────────

  async sendReaction(locationId, chatId, messageId, emoji) {
    const client = await this._getClientOrThrow(locationId);
    await client.invoke(
      new Api.messages.SendReaction({
        peer: chatId,
        msgId: messageId,
        reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
      }),
    );
    return true;
  }

  async forwardMessage(locationId, fromChatId, toChatId, messageId) {
    const client = await this._getClientOrThrow(locationId);
    const result = await client.forwardMessages(toChatId, {
      messages: [messageId],
      fromPeer: fromChatId,
    });
    return result[0]?.id;
  }

  async editMessage(locationId, chatId, messageId, text) {
    const client = await this._getClientOrThrow(locationId);
    await client.editMessage(chatId, { message: messageId, text });
    return true;
  }

  async deleteMessage(locationId, chatId, messageId) {
    const client = await this._getClientOrThrow(locationId);
    await client.deleteMessages(chatId, [messageId], { revoke: true });
    return true;
  }

  async pinMessage(locationId, chatId, messageId) {
    const client = await this._getClientOrThrow(locationId);
    await client.pinMessage(chatId, messageId);
    return true;
  }

  async generateInviteLink(locationId, chatId) {
    const client = await this._getClientOrThrow(locationId);
    const result = await client.invoke(
      new Api.messages.ExportChatInvite({ peer: chatId }),
    );
    return result.link;
  }

  async sendToGroup(locationId, groupId, text) {
    const client = await this._getClientOrThrow(locationId);
    const result = await client.sendMessage(groupId, { message: text });
    return result.id;
  }

  async sendFileToGroup(locationId, groupId, fileUrl, caption) {
    const client = await this._getClientOrThrow(locationId);
    const result = await client.sendMessage(groupId, {
      file: fileUrl,
      message: caption || '',
      forceDocument: true,
    });
    return result.id;
  }

  async editGroupPermissions(locationId, chatId, permissions) {
    const client = await this._getClientOrThrow(locationId);
    await client.invoke(
      new Api.messages.EditChatDefaultBannedRights({
        peer: chatId,
        bannedRights: new Api.ChatBannedRights({
          untilDate: 0,
          sendMessages: !permissions.sendMessages,
          sendMedia: !permissions.sendMedia,
          sendStickers: !permissions.sendStickers,
          sendGifs: !permissions.sendGifs,
          sendInline: !permissions.sendInline,
          embedLinks: !permissions.embedLinks,
          sendPolls: !permissions.sendPolls,
          changeInfo: !permissions.changeInfo,
          inviteUsers: !permissions.inviteUsers,
          pinMessages: !permissions.pinMessages,
        }),
      }),
    );
    return true;
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

    // Count active phone connections (don't connect them yet — lazy reconnect)
    const count = await Installation.countDocuments({
      'phoneConfig.isActive': true,
      'phoneConfig.sessionString': { $exists: true, $ne: '' },
    });

    if (count === 0) {
      console.log('No active phone connections to restore');
    } else {
      console.log(`${count} phone connection(s) found — will reconnect lazily on first message`);
    }
  }

  // Lazy reconnect: restore a single phone connection from saved session
  async _lazyReconnect(locationId) {
    const installation = await Installation.findOne({
      locationId,
      'phoneConfig.isActive': true,
      'phoneConfig.sessionString': { $exists: true, $ne: '' },
    });

    if (!installation) return null;

    console.log(`[LazyReconnect] Restoring phone connection for ${locationId}...`);
    try {
      await this.connect(locationId, installation.phoneConfig.sessionString);
      console.log(`[LazyReconnect] Phone reconnected for ${locationId}`);
      return this.getClient(locationId);
    } catch (error) {
      console.error(`[LazyReconnect] Failed for ${locationId}: ${error.message}`);
      return null;
    }
  }

  // ── Internal Helpers ─────────────────────────────────

  async _getClientOrThrow(locationId) {
    let client = this.getClient(locationId);

    // Lazy reconnect: if not connected, try to restore from saved session
    if (!client) {
      client = await this._lazyReconnect(locationId);
    }

    if (!client) {
      const err = new Error(`No active phone connection for location: ${locationId}`);
      err.statusCode = 400;
      throw err;
    }
    return client;
  }
}

module.exports = ConnectionManager;
