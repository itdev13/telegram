const axios = require('axios');
const WorkflowSubscription = require('../schemas/workflow-subscription.schema');

class WorkflowsService {
  constructor(contactMappingService, settingsService, telegramService, authService, connectionManager) {
    this.contactMapping = contactMappingService;
    this.settings = settingsService;
    this.telegram = telegramService;
    this.auth = authService;
    this.connectionManager = connectionManager;
  }

  // ═══════════════════════════════════════════════════════════
  // TRIGGER SUBSCRIPTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async handleSubscription(payload) {
    console.log(`[Workflows] handleSubscription called with payload:`, JSON.stringify(payload, null, 2));

    const { triggerData, extras, meta } = payload;
    const { eventType, targetUrl, filters } = triggerData;
    const { locationId, workflowId, companyId } = extras;
    const triggerKey = meta.key;

    console.log(
      `Trigger subscription ${eventType}: key=${triggerKey}, workflow=${workflowId}, location=${locationId}`,
    );

    switch (eventType) {
      case 'CREATED':
      case 'UPDATED':
        await WorkflowSubscription.findOneAndUpdate(
          { workflowId, triggerKey },
          {
            locationId,
            companyId,
            workflowId,
            triggerKey,
            targetUrl,
            filters: filters || {},
            extras,
            meta,
            status: 'active',
          },
          { upsert: true, returnDocument: 'after' },
        );
        console.log(`Subscription upserted: ${triggerKey} for workflow ${workflowId}`);
        break;

      case 'DELETED':
        await WorkflowSubscription.findOneAndUpdate(
          { workflowId, triggerKey },
          { status: 'deleted' },
        );
        console.log(`Subscription deleted: ${triggerKey} for workflow ${workflowId}`);
        break;

      default:
        console.warn(`Unknown subscription event type: ${eventType}`);
    }

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════
  // TRIGGER FIRING
  // ═══════════════════════════════════════════════════════════

  async fireTrigger(triggerKey, locationId, eventData) {
    try {
      console.log(`[Workflows] fireTrigger called: key=${triggerKey}, location=${locationId}`);

      const subscriptions = await WorkflowSubscription.find({
        locationId,
        triggerKey,
        status: 'active',
      });

      console.log(`[Workflows] Found ${subscriptions.length} active subscription(s) for ${triggerKey} @ ${locationId}`);

      if (subscriptions.length === 0) {
        console.log(`[Workflows] No subscriptions found — has a GHL workflow been created with this trigger?`);
        return;
      }

      // Get access token for authenticated trigger execution
      let accessToken = null;
      try {
        accessToken = await this.auth.getAccessToken(locationId);
      } catch (err) {
        console.error(`[Workflows] Failed to get access token for ${locationId}: ${err.message}`);
      }

      console.log(
        `[Workflows] Firing trigger ${triggerKey} for location ${locationId} → ${subscriptions.length} subscription(s) (auth: ${!!accessToken})`,
      );

      const headers = {
        'Content-Type': 'application/json',
        'Version': process.env.GHL_API_VERSION || '2021-07-28',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          console.log(`[Workflows] POSTing to targetUrl: ${sub.targetUrl} (workflow: ${sub.workflowId})`);
          console.log(`[Workflows] Headers: ${JSON.stringify({ ...headers, Authorization: headers.Authorization ? 'Bearer ***' + headers.Authorization.slice(-8) : 'NONE' })}`);
          console.log(`[Workflows] Payload: ${JSON.stringify(eventData)}`);
          try {
            const response = await axios.post(sub.targetUrl, eventData, {
              headers,
              timeout: 10000,
            });
            console.log(`[Workflows] Response status: ${response.status}`);
            console.log(`[Workflows] Response data: ${JSON.stringify(response.data)}`);
            return response;
          } catch (err) {
            console.error(`[Workflows] Error status: ${err.response?.status}`);
            console.error(`[Workflows] Error data: ${JSON.stringify(err.response?.data || err.message)}`);
            throw err;
          }
        }),
      );

      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'fulfilled') {
          console.log(`[Workflows] ✓ Trigger fired successfully to workflow ${subscriptions[i].workflowId}`);
        } else {
          console.error(
            `[Workflows] ✗ Failed to fire trigger to workflow ${subscriptions[i].workflowId}: ${results[i].reason?.message || results[i].reason}`,
          );
        }
      }
    } catch (error) {
      console.error(`Error firing trigger ${triggerKey}: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ACTION EXECUTION
  // ═══════════════════════════════════════════════════════════

  async executeSendMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { message, photoUrl, documentUrl, caption } = payload.data;

    if (!message && !photoUrl && !documentUrl) {
      throw new Error('At least one of message, photoUrl, or documentUrl is required');
    }

    const { botToken, chatId } = await this._resolveContact(locationId, contactId);
    let messageId;

    // Send text message
    if (message) {
      messageId = await this.telegram.sendMessage(botToken, chatId, message);
    }

    // Send photo
    if (photoUrl) {
      messageId = await this.telegram.sendPhoto(botToken, chatId, photoUrl, caption || undefined);
    }

    // Send document
    if (documentUrl) {
      messageId = await this.telegram.sendDocument(botToken, chatId, documentUrl, caption || undefined);
    }

    console.log(`Workflow action: sent to chat ${chatId}, messageId=${messageId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  // ═══════════════════════════════════════════════════════════
  // BOT ACTIONS (Advanced)
  // ═══════════════════════════════════════════════════════════

  async executeSendButtons(payload) {
    const { locationId, contactId } = payload.extras;
    const { message, buttons } = payload.data;
    if (!message) throw new Error('Message text is required');
    if (!buttons || !Array.isArray(buttons)) throw new Error('Buttons array is required');

    const { botToken, chatId } = await this._resolveContact(locationId, contactId);

    // Build inline keyboard: each button is { text, url? } or { text, callback_data? }
    const inlineKeyboard = buttons.map((row) => {
      const rowButtons = Array.isArray(row) ? row : [row];
      return rowButtons.map((btn) => ({
        text: btn.text,
        ...(btn.url ? { url: btn.url } : { callback_data: btn.callbackData || btn.text }),
      }));
    });

    const messageId = await this.telegram.sendMessageWithButtons(botToken, chatId, message, inlineKeyboard);
    console.log(`Workflow action: sent buttons to chat ${chatId}, messageId=${messageId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeForwardMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { fromChatId, messageId: srcMessageId } = payload.data;
    if (!fromChatId || !srcMessageId) throw new Error('fromChatId and messageId are required');

    const { botToken, chatId } = await this._resolveContact(locationId, contactId);
    const messageId = await this.telegram.forwardMessage(botToken, chatId, fromChatId, srcMessageId);
    console.log(`Workflow action: forwarded message to chat ${chatId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeEditMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { messageId: targetMessageId, message } = payload.data;
    if (!targetMessageId || !message) throw new Error('messageId and message are required');

    const { botToken, chatId } = await this._resolveContact(locationId, contactId);
    const messageId = await this.telegram.editMessage(botToken, chatId, targetMessageId, message);
    console.log(`Workflow action: edited message ${targetMessageId} in chat ${chatId}`);
    return { messageId, status: 'edited', telegramChatId: chatId };
  }

  async executeDeleteMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { messageId: targetMessageId } = payload.data;
    if (!targetMessageId) throw new Error('messageId is required');

    const { botToken, chatId } = await this._resolveContact(locationId, contactId);
    await this.telegram.deleteMessage(botToken, chatId, targetMessageId);
    console.log(`Workflow action: deleted message ${targetMessageId} in chat ${chatId}`);
    return { status: 'deleted', telegramChatId: chatId };
  }

  // ═══════════════════════════════════════════════════════════
  // PHONE ACTIONS (GramJS)
  // ═══════════════════════════════════════════════════════════

  async executeSendPhoneMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { message } = payload.data;
    if (!message) throw new Error('Message text is required');

    const chatId = await this._resolvePhoneChatId(locationId, contactId);
    this._requirePhone(locationId);
    const messageId = await this.connectionManager.sendMessage(locationId, chatId, message);
    console.log(`Workflow action: sent phone message to chat ${chatId}, messageId=${messageId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeSendToGroup(payload) {
    const { locationId } = payload.extras;
    const { groupId, message, fileUrl, caption } = payload.data;
    if (!groupId) throw new Error('groupId is required');
    if (!message && !fileUrl) throw new Error('At least one of message or fileUrl is required');

    this._requirePhone(locationId);
    let messageId;

    // Send text message to group
    if (message) {
      messageId = await this.connectionManager.sendToGroup(locationId, Number(groupId), message);
    }

    // Send file to group
    if (fileUrl) {
      messageId = await this.connectionManager.sendFileToGroup(locationId, Number(groupId), fileUrl, caption || '');
    }

    console.log(`Workflow action: sent to group ${groupId}, messageId=${messageId}`);
    return { messageId, status: 'sent', groupId };
  }

  async executeSendReaction(payload) {
    const { locationId, contactId } = payload.extras;
    const { messageId: targetMessageId, emoji } = payload.data;
    if (!targetMessageId || !emoji) throw new Error('messageId and emoji are required');

    const chatId = await this._resolvePhoneChatId(locationId, contactId);
    this._requirePhone(locationId);
    await this.connectionManager.sendReaction(locationId, chatId, Number(targetMessageId), emoji);
    console.log(`Workflow action: reacted ${emoji} to message ${targetMessageId}`);
    return { status: 'reacted', emoji, telegramChatId: chatId };
  }

  async executeGenerateInviteLink(payload) {
    const { locationId } = payload.extras;
    const { groupId } = payload.data;
    if (!groupId) throw new Error('groupId is required');

    this._requirePhone(locationId);
    const inviteLink = await this.connectionManager.generateInviteLink(locationId, Number(groupId));
    console.log(`Workflow action: generated invite link for group ${groupId}`);
    return { inviteLink, status: 'generated', groupId };
  }

  async executePinMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { messageId: targetMessageId } = payload.data;
    if (!targetMessageId) throw new Error('messageId is required');

    const chatId = await this._resolvePhoneChatId(locationId, contactId);
    this._requirePhone(locationId);
    await this.connectionManager.pinMessage(locationId, chatId, Number(targetMessageId));
    console.log(`Workflow action: pinned message ${targetMessageId} in chat ${chatId}`);
    return { status: 'pinned', telegramChatId: chatId };
  }

  async executeEditGroupPermissions(payload) {
    const { locationId } = payload.extras;
    const { groupId, permissions } = payload.data;
    if (!groupId || !permissions) throw new Error('groupId and permissions are required');

    this._requirePhone(locationId);
    await this.connectionManager.editGroupPermissions(locationId, Number(groupId), permissions);
    console.log(`Workflow action: edited group permissions for ${groupId}`);
    return { status: 'updated', groupId };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  async _resolveContact(locationId, contactId) {
    const chatId = await this.contactMapping.getTelegramChatId(locationId, contactId);
    if (!chatId) throw new Error('Contact has no Telegram mapping. The user must message the bot first.');

    const botToken = await this.settings.getBotToken(locationId);
    if (!botToken) throw new Error('No Telegram bot configured for this location.');

    return { botToken, chatId };
  }

  async _resolvePhoneChatId(locationId, contactId) {
    const chatId = await this.contactMapping.getTelegramChatId(locationId, contactId);
    if (!chatId) throw new Error('Contact has no Telegram mapping. The user must message first.');
    return chatId;
  }

  _requirePhone(locationId) {
    if (!this.connectionManager?.isConnected?.(locationId)) {
      throw new Error('No active phone connection for this location.');
    }
  }
}

module.exports = WorkflowsService;
