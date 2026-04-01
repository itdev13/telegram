const { Router } = require('express');
const Installation = require('../schemas/installation.schema');
const { MessageLog, MessageDirection, MessageStatus } = require('../schemas/message-log.schema');
const ArchivedToken = require('../schemas/archived-token.schema');
const CompanyLocation = require('../schemas/company-location.schema');
const Referral = require('../schemas/referral.schema');

function createWebhooksRouter(settingsService, telegramService, ghlService, contactMappingService) {
  const router = Router();

  // ═══════════════════════════════════════════════════════════
  // INBOUND: Telegram → GHL
  // ═══════════════════════════════════════════════════════════

  router.post('/telegram/:locationId', async (req, res) => {
    const { locationId } = req.params;
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    const update = req.body;

    // Step 1: Verify the webhook secret
    const expectedSecret = await settingsService.getWebhookSecret(locationId);
    if (!expectedSecret || secretToken !== expectedSecret) {
      return res.status(401).json({ error: 'Invalid Telegram webhook secret' });
    }

    // Step 2: Extract the message (handle both new and edited messages)
    const message = update.message || update.edited_message;
    if (!message) {
      console.debug('Received Telegram update without a message, skipping');
      return res.json({ ok: true });
    }

    const chatId = message.chat.id;
    const telegramUser = message.from;
    const isEdited = !!update.edited_message;

    console.log(`Inbound Telegram message from chat ${chatId} for location ${locationId}`);

    try {
      // Step 3: Get or create the GHL contact
      const ghlContactId = await contactMappingService.getOrCreateContact(
        locationId,
        telegramUser,
        chatId,
      );

      // Step 4: Get the installation's conversation provider ID
      const installation = await Installation.findOne({ locationId });

      if (!installation) {
        console.error(`No installation found for location: ${locationId}`);
        return res.json({ ok: false });
      }

      // Step 5: Build the message content
      let messageText = message.text || message.caption || '';
      if (isEdited && messageText) {
        messageText = `[Edited] ${messageText}`;
      }

      // Step 6: Handle attachments (photos, documents)
      const attachments = [];
      const botToken = await settingsService.getBotToken(locationId);

      if (botToken) {
        if (message.photo && message.photo.length > 0) {
          const largestPhoto = message.photo[message.photo.length - 1];
          const fileUrl = await telegramService.getFileUrl(botToken, largestPhoto.file_id);
          attachments.push(fileUrl);
        }

        if (message.document) {
          const fileUrl = await telegramService.getFileUrl(botToken, message.document.file_id);
          attachments.push(fileUrl);
        }
      }

      // Step 7: Push to GHL Conversations
      const result = await ghlService.addInboundMessage(locationId, {
        conversationProviderId: installation.conversationProviderId,
        contactId: ghlContactId,
        message: messageText || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        altId: String(chatId),
      });

      // Step 8: Log the message
      await MessageLog.create({
        locationId,
        direction: MessageDirection.INBOUND,
        telegramChatId: chatId,
        ghlMessageId: result.messageId,
        telegramMessageId: message.message_id,
        status: MessageStatus.DELIVERED,
      });

      console.log(
        `Inbound message synced: Telegram chat ${chatId} → GHL message ${result.messageId}`,
      );

      res.json({ ok: true });
    } catch (error) {
      console.error(`Failed to process inbound Telegram message from chat ${chatId}`);
      console.error(
        `Error: ${error.message}` +
          (error?.response?.status ? ` | Status: ${error.response.status}` : '') +
          (error?.response?.data ? ` | Response: ${JSON.stringify(error.response.data)}` : ''),
      );
      if (error?.stack) {
        console.error(`Stack: ${error.stack}`);
      }

      await MessageLog.create({
        locationId,
        direction: MessageDirection.INBOUND,
        telegramChatId: chatId,
        telegramMessageId: message.message_id,
        status: MessageStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      });

      res.json({ ok: false });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // OUTBOUND: GHL → Telegram
  // ═══════════════════════════════════════════════════════════

  router.post('/ghl-outbound', async (req, res) => {
    const { locationId, contactId, messageId, message, attachments, replyToAltId } = req.body;

    console.log(`Outbound GHL message ${messageId} for location ${locationId}`);

    try {
      // Step 1: Resolve the Telegram chat ID
      let telegramChatId = null;

      if (replyToAltId) {
        telegramChatId = Number(replyToAltId);
      } else {
        telegramChatId = await contactMappingService.getTelegramChatId(locationId, contactId);
      }

      if (!telegramChatId) {
        console.error(
          `No Telegram chat ID found for contact ${contactId} in location ${locationId}`,
        );
        await ghlService.updateMessageStatus(
          locationId,
          messageId,
          'failed',
          'No Telegram chat mapped',
        );
        return res.json({ ok: false });
      }

      // Step 2: Get the bot token for this location
      const botToken = await settingsService.getBotToken(locationId);
      if (!botToken) {
        console.error(`No active bot for location: ${locationId}`);
        await ghlService.updateMessageStatus(
          locationId,
          messageId,
          'failed',
          'No Telegram bot configured',
        );
        return res.json({ ok: false });
      }

      // Step 3: Send the message via Telegram
      let telegramMessageId;

      if (message) {
        telegramMessageId = await telegramService.sendMessage(botToken, telegramChatId, message);
      }

      if (attachments && attachments.length > 0) {
        for (const attachmentUrl of attachments) {
          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(attachmentUrl);
          if (isImage) {
            telegramMessageId = await telegramService.sendPhoto(
              botToken,
              telegramChatId,
              attachmentUrl,
            );
          } else {
            telegramMessageId = await telegramService.sendDocument(
              botToken,
              telegramChatId,
              attachmentUrl,
            );
          }
        }
      }

      // Step 4: Update message status in GHL
      await ghlService.updateMessageStatus(locationId, messageId, 'delivered');

      // Step 5: Log the message
      await MessageLog.create({
        locationId,
        direction: MessageDirection.OUTBOUND,
        telegramChatId,
        ghlMessageId: messageId,
        telegramMessageId: telegramMessageId || undefined,
        status: MessageStatus.DELIVERED,
      });

      console.log(
        `Outbound message synced: GHL message ${messageId} → Telegram chat ${telegramChatId}`,
      );

      res.json({ ok: true });
    } catch (error) {
      console.error(`Failed to forward outbound message ${messageId} to Telegram`);
      console.error(
        `Error: ${error.message}` +
          (error?.response?.status ? ` | Status: ${error.response.status}` : '') +
          (error?.response?.data ? ` | Response: ${JSON.stringify(error.response.data)}` : ''),
      );

      await ghlService.updateMessageStatus(
        locationId,
        messageId,
        'failed',
        error.message || 'Telegram send failed',
      );

      await MessageLog.create({
        locationId,
        direction: MessageDirection.OUTBOUND,
        telegramChatId: replyToAltId ? Number(replyToAltId) : 0,
        ghlMessageId: messageId,
        status: MessageStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      });

      res.json({ ok: false });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // APP LIFECYCLE: Install / Uninstall
  // ═══════════════════════════════════════════════════════════

  router.post('/ghl-app-lifecycle', async (req, res) => {
    const { type } = req.body;

    switch (type) {
      case 'INSTALL':
        return await handleAppInstall(req.body, res);
      case 'UNINSTALL':
        return await handleAppUninstall(req.body, settingsService, telegramService, res);
      default:
        console.warn(`Unknown app lifecycle event type: ${type}`);
        return res.json({ ok: true });
    }
  });

  return router;
}

async function handleAppInstall(payload, res) {
  const { locationId, companyId } = payload;
  console.log(`App installed for location: ${locationId}, company: ${companyId}`);

  if (locationId && companyId) {
    await CompanyLocation.findOneAndUpdate(
      { companyId },
      { $addToSet: { locationIds: locationId } },
      { upsert: true },
    );
    console.log(`Recorded location ${locationId} under company ${companyId}`);
  }

  res.json({ ok: true });
}

async function handleAppUninstall(payload, settingsService, telegramService, res) {
  const locationId = payload.locationId;
  console.log(`App uninstalled for location: ${locationId}`);

  try {
    const installation = await Installation.findOne({ locationId });

    if (installation) {
      // Archive tokens
      await ArchivedToken.create({
        companyId: installation.companyId,
        locationId,
        accessToken: installation.accessToken,
        refreshToken: installation.refreshToken,
        originalCreatedAt: installation.createdAt,
        originalExpiresAt: installation.tokenExpiresAt,
        deletedAt: new Date(),
        deletionReason: 'app_uninstall',
        uninstallWebhookData: payload,
        autoDeleteAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });

      // Soft-delete installation
      await Installation.updateOne(
        { locationId },
        {
          status: 'uninstalled',
          uninstalledAt: new Date(),
          accessToken: '',
          refreshToken: '',
        },
      );
    }

    // Clean up Telegram webhook
    const botToken = await settingsService.getBotToken(locationId);
    if (botToken) {
      await telegramService.deleteWebhook(botToken);
    }

    // Clear Telegram bot config
    await Installation.updateOne({ locationId }, { telegramConfig: null });

    // Update referral status
    await Referral.updateMany(
      { locationId, status: 'installed' },
      { status: 'uninstalled', uninstalledAt: new Date() },
    );

    console.log(`Soft-delete cleanup complete for location: ${locationId}`);
  } catch (error) {
    console.error(`Uninstall cleanup failed for ${locationId}`, error);
  }

  res.json({ ok: true });
}

module.exports = { createWebhooksRouter };
