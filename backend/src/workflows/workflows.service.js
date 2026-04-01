const axios = require('axios');
const WorkflowSubscription = require('../schemas/workflow-subscription.schema');

class WorkflowsService {
  constructor(contactMappingService, settingsService, telegramService) {
    this.contactMapping = contactMappingService;
    this.settings = settingsService;
    this.telegram = telegramService;
  }

  // ═══════════════════════════════════════════════════════════
  // TRIGGER SUBSCRIPTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async handleSubscription(payload) {
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
          { upsert: true, new: true },
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

      if (subscriptions.length === 0) {
        return;
      }

      console.log(
        `Firing trigger ${triggerKey} for location ${locationId} → ${subscriptions.length} subscription(s)`,
      );

      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          axios.post(sub.targetUrl, eventData, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
          }),
        ),
      );

      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          console.error(
            `Failed to fire trigger to workflow ${subscriptions[i].workflowId}: ${results[i].reason?.message || results[i].reason}`,
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
    const { message } = payload.data;

    if (!message) {
      throw new Error('Message text is required');
    }

    const { botToken, chatId } = await this._resolveContact(locationId, contactId);
    const messageId = await this.telegram.sendMessage(botToken, chatId, message);

    console.log(`Workflow action: sent message to chat ${chatId}, messageId=${messageId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeSendPhoto(payload) {
    const { locationId, contactId } = payload.extras;
    const { photoUrl, caption } = payload.data;

    if (!photoUrl) {
      throw new Error('Photo URL is required');
    }

    const { botToken, chatId } = await this._resolveContact(locationId, contactId);
    const messageId = await this.telegram.sendPhoto(botToken, chatId, photoUrl, caption || undefined);

    console.log(`Workflow action: sent photo to chat ${chatId}, messageId=${messageId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeSendDocument(payload) {
    const { locationId, contactId } = payload.extras;
    const { documentUrl, caption } = payload.data;

    if (!documentUrl) {
      throw new Error('Document URL is required');
    }

    const { botToken, chatId } = await this._resolveContact(locationId, contactId);
    const messageId = await this.telegram.sendDocument(
      botToken,
      chatId,
      documentUrl,
      caption || undefined,
    );

    console.log(`Workflow action: sent document to chat ${chatId}, messageId=${messageId}`);
    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  async _resolveContact(locationId, contactId) {
    const chatId = await this.contactMapping.getTelegramChatId(locationId, contactId);

    if (!chatId) {
      throw new Error('Contact has no Telegram mapping. The user must message the bot first.');
    }

    const botToken = await this.settings.getBotToken(locationId);

    if (!botToken) {
      throw new Error('No Telegram bot configured for this location.');
    }

    return { botToken, chatId };
  }
}

module.exports = WorkflowsService;
