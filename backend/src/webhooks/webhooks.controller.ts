import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  Logger,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Installation, InstallationDocument } from '../schemas/installation.schema';
import { MessageLog, MessageLogDocument, MessageDirection, MessageStatus } from '../schemas/message-log.schema';
import { ContactMapping, ContactMappingDocument } from '../schemas/contact-mapping.schema';
import { SettingsService } from '../settings/settings.service';
import { TelegramService } from '../telegram/telegram.service';
import { GhlService } from '../ghl/ghl.service';
import { ContactMappingService } from '../contact-mapping/contact-mapping.service';
import {
  TelegramUpdate,
  GhlOutboundPayload,
} from '../common/interfaces';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @InjectModel(Installation.name)
    private installationModel: Model<InstallationDocument>,
    @InjectModel(MessageLog.name)
    private messageLogModel: Model<MessageLogDocument>,
    @InjectModel(ContactMapping.name)
    private contactMappingModel: Model<ContactMappingDocument>,
    private settings: SettingsService,
    private telegram: TelegramService,
    private ghl: GhlService,
    private contactMapping: ContactMappingService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // INBOUND: Telegram → GHL
  // ═══════════════════════════════════════════════════════════

  @Post('telegram/:locationId')
  @HttpCode(HttpStatus.OK)
  async handleTelegramWebhook(
    @Param('locationId') locationId: string,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
    @Body() update: TelegramUpdate,
  ) {
    // Step 1: Verify the webhook secret
    const expectedSecret = await this.settings.getWebhookSecret(locationId);
    if (!expectedSecret || secretToken !== expectedSecret) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }

    // Step 2: Extract the message (handle both new and edited messages)
    const message = update.message || update.edited_message;
    if (!message) {
      this.logger.debug('Received Telegram update without a message, skipping');
      return { ok: true };
    }

    const chatId = message.chat.id;
    const telegramUser = message.from;
    const isEdited = !!update.edited_message;

    this.logger.log(
      `Inbound Telegram message from chat ${chatId} for location ${locationId}`,
    );

    try {
      // Step 3: Get or create the GHL contact
      const ghlContactId = await this.contactMapping.getOrCreateContact(
        locationId,
        telegramUser,
        chatId,
      );

      // Step 4: Get the installation's conversation provider ID
      const installation = await this.installationModel.findOne({ locationId });

      if (!installation) {
        this.logger.error(`No installation found for location: ${locationId}`);
        return { ok: false };
      }

      // Step 5: Build the message content
      let messageText = message.text || message.caption || '';
      if (isEdited && messageText) {
        messageText = `[Edited] ${messageText}`;
      }

      // Step 6: Handle attachments (photos, documents)
      const attachments: string[] = [];
      const botToken = await this.settings.getBotToken(locationId);

      if (botToken) {
        if (message.photo && message.photo.length > 0) {
          const largestPhoto = message.photo[message.photo.length - 1];
          const fileUrl = await this.telegram.getFileUrl(botToken, largestPhoto.file_id);
          attachments.push(fileUrl);
        }

        if (message.document) {
          const fileUrl = await this.telegram.getFileUrl(botToken, message.document.file_id);
          attachments.push(fileUrl);
        }
      }

      // Step 7: Push to GHL Conversations
      const result = await this.ghl.addInboundMessage(locationId, {
        conversationProviderId: installation.conversationProviderId,
        contactId: ghlContactId,
        message: messageText || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        altId: String(chatId),
      });

      // Step 8: Log the message
      await this.messageLogModel.create({
        locationId,
        direction: MessageDirection.INBOUND,
        telegramChatId: chatId,
        ghlMessageId: result.messageId,
        telegramMessageId: message.message_id,
        status: MessageStatus.DELIVERED,
      });

      this.logger.log(
        `Inbound message synced: Telegram chat ${chatId} → GHL message ${result.messageId}`,
      );

      return { ok: true };
    } catch (error) {
      this.logger.error(
        `Failed to process inbound Telegram message from chat ${chatId}`,
        error,
      );

      // Log the failure
      await this.messageLogModel.create({
        locationId,
        direction: MessageDirection.INBOUND,
        telegramChatId: chatId,
        telegramMessageId: message.message_id,
        status: MessageStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      });

      return { ok: false };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // OUTBOUND: GHL → Telegram
  // ═══════════════════════════════════════════════════════════

  @Post('ghl-outbound')
  @HttpCode(HttpStatus.OK)
  async handleGhlOutbound(@Body() payload: GhlOutboundPayload) {
    const { locationId, contactId, messageId, message, attachments, replyToAltId } = payload;

    this.logger.log(
      `Outbound GHL message ${messageId} for location ${locationId}`,
    );

    try {
      // Step 1: Resolve the Telegram chat ID
      let telegramChatId: number | null = null;

      if (replyToAltId) {
        telegramChatId = Number(replyToAltId);
      } else {
        telegramChatId = await this.contactMapping.getTelegramChatId(
          locationId,
          contactId,
        );
      }

      if (!telegramChatId) {
        this.logger.error(
          `No Telegram chat ID found for contact ${contactId} in location ${locationId}`,
        );
        await this.ghl.updateMessageStatus(locationId, messageId, 'failed', 'No Telegram chat mapped');
        return { ok: false };
      }

      // Step 2: Get the bot token for this location
      const botToken = await this.settings.getBotToken(locationId);
      if (!botToken) {
        this.logger.error(`No active bot for location: ${locationId}`);
        await this.ghl.updateMessageStatus(locationId, messageId, 'failed', 'No Telegram bot configured');
        return { ok: false };
      }

      // Step 3: Send the message via Telegram
      let telegramMessageId: number | undefined;

      // Send text message
      if (message) {
        telegramMessageId = await this.telegram.sendMessage(botToken, telegramChatId, message);
      }

      // Send attachments
      if (attachments && attachments.length > 0) {
        for (const attachmentUrl of attachments) {
          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(attachmentUrl);
          if (isImage) {
            telegramMessageId = await this.telegram.sendPhoto(
              botToken,
              telegramChatId,
              attachmentUrl,
            );
          } else {
            telegramMessageId = await this.telegram.sendDocument(
              botToken,
              telegramChatId,
              attachmentUrl,
            );
          }
        }
      }

      // Step 4: Update message status in GHL
      await this.ghl.updateMessageStatus(locationId, messageId, 'delivered');

      // Step 5: Log the message
      await this.messageLogModel.create({
        locationId,
        direction: MessageDirection.OUTBOUND,
        telegramChatId,
        ghlMessageId: messageId,
        telegramMessageId: telegramMessageId || undefined,
        status: MessageStatus.DELIVERED,
      });

      this.logger.log(
        `Outbound message synced: GHL message ${messageId} → Telegram chat ${telegramChatId}`,
      );

      return { ok: true };
    } catch (error) {
      this.logger.error(
        `Failed to forward outbound message ${messageId} to Telegram`,
        error,
      );

      // Update GHL message status to failed
      await this.ghl.updateMessageStatus(
        locationId,
        messageId,
        'failed',
        error.message || 'Telegram send failed',
      );

      // Log the failure
      await this.messageLogModel.create({
        locationId,
        direction: MessageDirection.OUTBOUND,
        telegramChatId: replyToAltId ? Number(replyToAltId) : 0,
        ghlMessageId: messageId,
        status: MessageStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      });

      return { ok: false };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // APP LIFECYCLE: Install / Uninstall
  // ═══════════════════════════════════════════════════════════

  @Post('ghl-app-install')
  @HttpCode(HttpStatus.OK)
  async handleAppInstall(@Body() payload: any) {
    this.logger.log(`App installed for location: ${payload.locationId}`);
    return { ok: true };
  }

  @Post('ghl-app-uninstall')
  @HttpCode(HttpStatus.OK)
  async handleAppUninstall(@Body() payload: any) {
    const locationId = payload.locationId;
    this.logger.log(`App uninstalled for location: ${locationId}`);

    try {
      // Clean up Telegram webhook
      const botToken = await this.settings.getBotToken(locationId);
      if (botToken) {
        await this.telegram.deleteWebhook(botToken);
      }

      // Delete all data for this location (manual cascade)
      await this.contactMappingModel.deleteMany({ locationId });
      await this.messageLogModel.deleteMany({ locationId });
      await this.installationModel.deleteOne({ locationId });

      this.logger.log(`Cleanup complete for location: ${locationId}`);
    } catch (error) {
      this.logger.error(`Uninstall cleanup failed for ${locationId}`, error);
    }

    return { ok: true };
  }
}
