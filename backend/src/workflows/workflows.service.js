const axios = require('axios');
const WorkflowSubscription = require('../schemas/workflow-subscription.schema');

class WorkflowsService {
  constructor(contactMappingService, settingsService, telegramService, authService) {
    this.contactMapping = contactMappingService;
    this.settings = settingsService;
    this.telegram = telegramService;
    this.auth = authService;
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
