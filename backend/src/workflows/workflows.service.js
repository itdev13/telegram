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
    const { triggerData, extras, meta } = payload;
    const { eventType, targetUrl, filters } = triggerData;
    const { locationId, workflowId, companyId } = extras;
    const triggerKey = meta.key;

    console.log(`[Workflows] Subscription ${eventType}: key=${triggerKey}, workflow=${workflowId}, location=${locationId}`);

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
      const subscriptions = await WorkflowSubscription.find({
        locationId,
        triggerKey,
        status: 'active',
      });

      if (subscriptions.length === 0) return;

      let accessToken = null;
      try {
        accessToken = await this.auth.getAccessToken(locationId);
      } catch (err) {
        console.error(`[Workflows] Cannot get token for trigger ${triggerKey} @ ${locationId}: ${err.message}`);
      }

      const headers = {
        'Content-Type': 'application/json',
        'Version': process.env.GHL_API_VERSION || '2021-07-28',
      };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          axios.post(sub.targetUrl, eventData, { headers, timeout: 10000 }),
        ),
      );

      for (let i = 0; i < results.length; i++) {
        const sub = subscriptions[i];
        if (results[i].status === 'fulfilled') {
          console.log(`[Workflows] Fired ${triggerKey} → workflow ${sub.workflowId} (location ${locationId})`);
        } else {
          const err = results[i].reason;
          const status = err.response?.status;
          const ghlMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Unknown error';
          const reason = classifyWorkflowError(status, ghlMsg);

          console.error(
            `[Workflows] Failed to fire ${triggerKey} → workflow ${sub.workflowId} (location ${locationId})\n` +
            `  Status: ${status || 'no-response'}\n` +
            `  Reason: ${reason.label}\n` +
            `  GHL says: ${ghlMsg}\n` +
            `  Action: ${reason.action}`
          );
        }
      }
    } catch (error) {
      console.error(`[Workflows] fireTrigger error for ${triggerKey} @ ${locationId}: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ACTION EXECUTION
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // ALL ACTIONS (transport-agnostic: uses bot or phone, whichever is available)
  // ═══════════════════════════════════════════════════════════

  // GHL sends action inputs in payload.data or payload.inputData depending on version
  _getData(payload) {
    return payload.data || payload.inputData || {};
  }

  async executeSendMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { message, photoUrl, documentUrl, caption } = this._getData(payload);
    if (!message && !photoUrl && !documentUrl) throw new Error('At least one of message, photoUrl, or documentUrl is required');

    const { chatId, transport, botToken } = await this._resolve(locationId, contactId);
    let messageId;

    if (transport === 'phone') {
      if (message) messageId = await this.connectionManager.sendMessage(locationId, chatId, message);
      if (photoUrl) messageId = await this.connectionManager.sendPhoto(locationId, chatId, photoUrl, caption);
      if (documentUrl) messageId = await this.connectionManager.sendDocument(locationId, chatId, documentUrl, caption);
    } else {
      if (message) messageId = await this.telegram.sendMessage(botToken, chatId, message);
      if (photoUrl) messageId = await this.telegram.sendPhoto(botToken, chatId, photoUrl, caption || undefined);
      if (documentUrl) messageId = await this.telegram.sendDocument(botToken, chatId, documentUrl, caption || undefined);
    }

    console.log(`Workflow action [${transport}]: sent to chat ${chatId}, messageId=${messageId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeSendButtons(payload) {
    const { locationId, contactId } = payload.extras;
    const { message } = this._getData(payload);
    let { buttons } = this._getData(payload);

    if (!message) throw new Error('Message text is required');
    if (!buttons) throw new Error('Buttons array is required');

    // GHL may send the buttons as a JSON string — parse it
    if (typeof buttons === 'string') {
      try {
        buttons = JSON.parse(buttons.trim());
      } catch {
        throw new Error(`buttons field is not valid JSON: ${buttons}`);
      }
    }

    if (!Array.isArray(buttons)) throw new Error('Buttons must be an array');

    const { chatId, botToken } = await this._resolve(locationId, contactId);
    if (!botToken) throw new Error('Send Buttons requires a bot connection.');

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
    const { fromChatId, messageId: srcMessageId } = this._getData(payload);
    if (!fromChatId || !srcMessageId) throw new Error('fromChatId and messageId are required');

    const { chatId, transport, botToken } = await this._resolve(locationId, contactId);
    let messageId;

    if (transport === 'phone') {
      messageId = await this.connectionManager.forwardMessage(locationId, Number(fromChatId), chatId, Number(srcMessageId));
    } else {
      messageId = await this.telegram.forwardMessage(botToken, chatId, fromChatId, srcMessageId);
    }

    console.log(`Workflow action [${transport}]: forwarded msgId=${srcMessageId} to chat ${chatId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeEditMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { messageId: targetMessageId, message } = this._getData(payload);
    if (!targetMessageId || !message) throw new Error('messageId and message are required');

    const { chatId, transport, botToken } = await this._resolve(locationId, contactId);

    if (transport === 'phone') {
      await this.connectionManager.editMessage(locationId, chatId, Number(targetMessageId), message);
    } else {
      await this.telegram.editMessage(botToken, chatId, targetMessageId, message);
    }

    console.log(`Workflow action [${transport}]: edited message ${targetMessageId} in chat ${chatId}`);
    return { messageId: targetMessageId, status: 'edited', telegramChatId: chatId };
  }

  async executeDeleteMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { messageId: targetMessageId } = this._getData(payload);
    if (!targetMessageId) throw new Error('messageId is required');

    const { chatId, transport, botToken } = await this._resolve(locationId, contactId);

    if (transport === 'phone') {
      await this.connectionManager.deleteMessage(locationId, chatId, Number(targetMessageId));
    } else {
      await this.telegram.deleteMessage(botToken, chatId, targetMessageId);
    }

    console.log(`Workflow action [${transport}]: deleted message ${targetMessageId} in chat ${chatId}`);
    return { status: 'deleted', telegramChatId: chatId };
  }

  async executeSendPhoneMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { message } = this._getData(payload);
    if (!message) throw new Error('Message text is required');

    const { chatId, transport, botToken } = await this._resolve(locationId, contactId);
    let messageId;

    if (transport === 'phone') {
      messageId = await this.connectionManager.sendMessage(locationId, chatId, message);
    } else {
      messageId = await this.telegram.sendMessage(botToken, chatId, message);
    }

    console.log(`Workflow action [${transport}]: sent message to chat ${chatId}, messageId=${messageId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeSendToGroup(payload) {
    const { locationId } = payload.extras;
    const { groupId, message, fileUrl, caption } = this._getData(payload);
    if (!groupId) throw new Error('groupId is required');
    if (!message && !fileUrl) throw new Error('At least one of message or fileUrl is required');

    const { transport, botToken } = await this._resolveTransport(locationId);
    let messageId;

    if (transport === 'phone') {
      if (message) messageId = await this.connectionManager.sendToGroup(locationId, Number(groupId), message);
      if (fileUrl) messageId = await this.connectionManager.sendFileToGroup(locationId, Number(groupId), fileUrl, caption || '');
    } else {
      if (message) messageId = await this.telegram.sendMessage(botToken, Number(groupId), message);
      if (fileUrl) messageId = await this.telegram.sendDocument(botToken, Number(groupId), fileUrl, caption || undefined);
    }

    console.log(`Workflow action [${transport}]: sent to group ${groupId}, messageId=${messageId}`);
    return { messageId, status: 'sent', groupId };
  }

  async executeSendReaction(payload) {
    const { locationId, contactId } = payload.extras;

    // GHL may send action inputs in payload.data or payload.inputData
    const data = payload.data || payload.inputData || {};
    const targetMessageId = data.messageId || data.message_id;
    const emoji = data.emoji;

    console.log(`[Workflows] send-reaction inputs: messageId=${targetMessageId} (${typeof targetMessageId}), emoji=${emoji} | raw.data=${JSON.stringify(payload.data)} raw.inputData=${JSON.stringify(payload.inputData)}`);

    if (!targetMessageId) throw new Error('messageId is required — pass the Telegram message ID to react to (e.g. from trigger output telegramMessageId)');
    if (!emoji) throw new Error('emoji is required — pass a valid Telegram reaction emoji (e.g. ❤️)');

    const parsedMessageId = Number(targetMessageId);
    if (!parsedMessageId || isNaN(parsedMessageId)) throw new Error(`messageId must be a valid number, got: "${targetMessageId}"`);

    const { chatId, transport, botToken } = await this._resolve(locationId, contactId);

    if (transport === 'phone') {
      await this.connectionManager.sendReaction(locationId, chatId, parsedMessageId, emoji);
    } else {
      await this.telegram.sendReaction(botToken, chatId, parsedMessageId, emoji);
    }

    console.log(`Workflow action [${transport}]: reacted ${emoji} to message ${targetMessageId}`);
    return { status: 'reacted', emoji, telegramChatId: chatId };
  }

  async executeGenerateInviteLink(payload) {
    const { locationId, contactId } = payload.extras;
    const { groupId } = this._getData(payload);
    if (!groupId) throw new Error('groupId is required — provide the numeric Telegram group/supergroup ID (e.g. -1001234567890)');

    const parsedGroupId = Number(groupId);
    if (isNaN(parsedGroupId)) throw new Error(`groupId must be a numeric Telegram group ID, got: "${groupId}". Do not pass an invite link URL.`);

    // Step 1: generate the link (we always need the transport/botToken for the group action)
    const { transport, botToken } = await this._resolveTransport(locationId);
    let inviteLink;
    if (transport === 'phone') {
      inviteLink = await this.connectionManager.generateInviteLink(locationId, parsedGroupId);
    } else {
      inviteLink = await this.telegram.generateInviteLink(botToken, parsedGroupId);
    }
    console.log(`Workflow action [${transport}]: generated invite link for group ${groupId}`);

    // Step 2: deliver the link to the triggering contact.
    // Failure to deliver must not hide the generated link — callers that chain the action still use the return value.
    let delivered = false;
    let deliveryError = null;
    if (contactId) {
      try {
        const resolved = await this._resolve(locationId, contactId);
        const text = `Here's your invite link to join the group:\n${inviteLink}`;
        if (resolved.transport === 'phone') {
          await this.connectionManager.sendMessage(locationId, resolved.chatId, text);
        } else {
          await this.telegram.sendMessage(resolved.botToken, resolved.chatId, text);
        }
        delivered = true;
        console.log(`Workflow action [${resolved.transport}]: delivered invite link to contact ${contactId}`);
      } catch (err) {
        deliveryError = err.message;
        console.error(`Workflow action: failed to deliver invite link to contact ${contactId}: ${err.message}`);
      }
    }

    return { inviteLink, delivered, deliveryError, status: 'generated', groupId };
  }

  async executePinMessage(payload) {
    const { locationId, contactId } = payload.extras;
    const { messageId: targetMessageId } = this._getData(payload);
    if (!targetMessageId) throw new Error('messageId is required — pass the numeric Telegram message ID (e.g. from trigger output telegramMessageId)');

    const parsedMessageId = Number(targetMessageId);
    if (!parsedMessageId || isNaN(parsedMessageId)) throw new Error(`messageId must be a valid number, got: "${targetMessageId}"`);

    const { chatId, transport, botToken } = await this._resolve(locationId, contactId);

    if (transport === 'phone') {
      await this.connectionManager.pinMessage(locationId, chatId, parsedMessageId);
    } else {
      await this.telegram.pinMessage(botToken, chatId, parsedMessageId);
    }

    console.log(`Workflow action [${transport}]: pinned message ${targetMessageId} in chat ${chatId}`);
    return { status: 'pinned', telegramChatId: chatId };
  }

  async executeEditGroupPermissions(payload) {
    const { locationId } = payload.extras;
    const { groupId, permissions } = this._getData(payload);
    if (!groupId || !permissions) throw new Error('groupId and permissions are required');

    const { transport, botToken } = await this._resolveTransport(locationId);

    if (transport === 'phone') {
      await this.connectionManager.editGroupPermissions(locationId, Number(groupId), permissions);
    } else {
      await this.telegram.setChatPermissions(botToken, Number(groupId), permissions);
    }

    console.log(`Workflow action [${transport}]: edited group permissions for ${groupId}`);
    return { status: 'updated', groupId };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  // Resolve contact chatId + pick transport based on how the contact was created
  async _resolve(locationId, contactId) {
    const mapping = await this.contactMapping.getContactMapping(locationId, contactId);
    if (!mapping) throw new Error('Contact has no Telegram mapping. The user must message first.');

    const chatId = mapping.telegramChatId;
    const contactSource = mapping.source || 'bot';

    const hasPhone = await this.connectionManager?.hasPhoneConfig?.(locationId);
    const botToken = await this.settings.getBotToken(locationId);

    if (!hasPhone && !botToken) throw new Error('No Telegram connection configured. Connect a bot or phone in TeleSync settings.');

    // Use the transport that created this contact, fallback to whatever is available
    let transport;
    if (contactSource === 'phone' && hasPhone) {
      transport = 'phone';
    } else if (contactSource === 'bot' && botToken) {
      transport = 'bot';
    } else {
      transport = hasPhone ? 'phone' : 'bot';
    }

    console.log(`[Workflows] Contact ${contactId} source=${contactSource}, using transport=${transport}`);
    return { chatId, transport, botToken };
  }

  // Resolve transport only (for group actions without contactId)
  async _resolveTransport(locationId) {
    const hasPhone = await this.connectionManager?.hasPhoneConfig?.(locationId);
    const botToken = await this.settings.getBotToken(locationId);

    if (!hasPhone && !botToken) throw new Error('No Telegram connection configured. Connect a bot or phone in TeleSync settings.');

    const transport = hasPhone ? 'phone' : 'bot';
    return { transport, botToken };
  }
}

/**
 * Classify a GHL workflow trigger failure into a user-actionable reason.
 * GHL surfaces a wide variety of error messages — this maps the common ones
 * into a label + action so logs are readable at a glance.
 */
function classifyWorkflowError(status, message = '') {
  const msg = String(message).toLowerCase();
  console.log("msg error: ", msg)
  if (msg.includes('premium action') && (msg.includes('does not have enough funds') || msg.includes('billing'))) {
    return {
      label: 'GHL Premium Action billing failed',
      action: 'Customer needs to top up Premium Action credits in GHL (Settings → Billing → Premium Action Pricing). This is GHL workflow billing, NOT our app wallet.'
    };
  }
  if (msg.includes('does not have enough funds') || msg.includes('insufficient')) {
    return {
      label: 'GHL company funds insufficient',
      action: 'Customer needs to add funds to the GHL company wallet for the failing premium step.'
    };
  }
  if (status === 401 || status === 403 || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return {
      label: 'Auth rejected by GHL',
      action: 'OAuth token may be expired or revoked. Verify the install is still active.'
    };
  }
  if (status === 404 || msg.includes('not found') || msg.includes('workflow does not exist')) {
    return {
      label: 'Workflow not found',
      action: 'Workflow was deleted or unpublished in GHL. Remove the stale subscription from workflow_subscriptions.'
    };
  }
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return {
      label: 'GHL rate limit hit',
      action: 'Throttle outbound trigger fires. Will retry on next inbound message.'
    };
  }
  if (status === 408 || msg.includes('timeout') || msg.includes('timed out')) {
    return {
      label: 'Request to GHL timed out',
      action: 'GHL took >10s to respond. Likely transient — next inbound message will retry.'
    };
  }
  if (status >= 500) {
    return {
      label: 'GHL server error',
      action: 'Transient GHL outage — next inbound message will retry. If persistent, check GHL status page.'
    };
  }
  if (!status) {
    return {
      label: 'No response from GHL',
      action: 'Network error or DNS failure reaching the trigger URL. Check connectivity.'
    };
  }
  return {
    label: `GHL returned ${status}`,
    action: 'Inspect the GHL response message above. Not a known billing/auth/rate issue.'
  };
}

module.exports = WorkflowsService;
