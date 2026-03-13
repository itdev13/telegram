import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Installation, InstallationDocument } from '../schemas/installation.schema';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectModel(Installation.name)
    private installationModel: Model<InstallationDocument>,
    private crypto: CryptoService,
    private telegram: TelegramService,
  ) {}

  /**
   * Get current Telegram configuration for a location.
   * Returns bot info without exposing the token.
   */
  async getConfig(locationId: string) {
    const installation = await this.installationModel.findOne({ locationId });
    const config = installation?.telegramConfig;

    if (!config) {
      return { connected: false, bot: null };
    }

    return {
      connected: config.isActive,
      bot: {
        username: config.botUsername,
        id: String(config.botId),
        isActive: config.isActive,
        connectedAt: config.createdAt,
      },
    };
  }

  /**
   * Connect a Telegram bot to a GHL location.
   * Validates the token, stores encrypted config, and registers webhook.
   */
  async connectBot(locationId: string, botToken: string) {
    // Step 1: Validate the bot token with Telegram
    const botInfo = await this.telegram.validateBotToken(botToken);

    // Step 2: Check if this location already has a config — disconnect old bot
    const installation = await this.installationModel.findOne({ locationId });
    if (installation?.telegramConfig) {
      const oldToken = this.crypto.decrypt(installation.telegramConfig.botToken);
      await this.telegram.deleteWebhook(oldToken);
    }

    // Step 3: Generate a webhook secret for verification
    const webhookSecret = this.crypto.generateWebhookSecret();

    // Step 4: Register the webhook with Telegram
    await this.telegram.setWebhook(botToken, locationId, webhookSecret);

    // Step 5: Store encrypted config as embedded subdocument
    const encryptedToken = this.crypto.encrypt(botToken);

    await this.installationModel.updateOne(
      { locationId },
      {
        telegramConfig: {
          botToken: encryptedToken,
          botUsername: botInfo.username,
          botId: botInfo.id,
          webhookSecret,
          isActive: true,
          createdAt: installation?.telegramConfig?.createdAt || new Date(),
          updatedAt: new Date(),
        },
      },
    );

    this.logger.log(
      `Bot @${botInfo.username} connected for location: ${locationId}`,
    );

    return {
      connected: true,
      bot: {
        username: botInfo.username,
        id: botInfo.id.toString(),
        isActive: true,
      },
    };
  }

  /**
   * Disconnect the Telegram bot from a location.
   * Removes webhook and clears the embedded config.
   */
  async disconnectBot(locationId: string) {
    const installation = await this.installationModel.findOne({ locationId });
    const config = installation?.telegramConfig;

    if (!config) {
      throw new NotFoundException('No Telegram bot configured for this location');
    }

    // Remove the Telegram webhook
    const botToken = this.crypto.decrypt(config.botToken);
    await this.telegram.deleteWebhook(botToken);

    // Clear the embedded config
    await this.installationModel.updateOne(
      { locationId },
      { telegramConfig: null },
    );

    this.logger.log(`Bot disconnected for location: ${locationId}`);

    return { connected: false, bot: null };
  }

  /**
   * Check the health of the Telegram webhook.
   */
  async checkStatus(locationId: string) {
    const installation = await this.installationModel.findOne({ locationId });
    const config = installation?.telegramConfig;

    if (!config) {
      return { status: 'disconnected', webhook: null };
    }

    try {
      const botToken = this.crypto.decrypt(config.botToken);
      const webhookInfo = await this.telegram.getWebhookInfo(botToken);

      return {
        status: config.isActive ? 'connected' : 'inactive',
        webhook: {
          url: webhookInfo.url,
          hasCustomCertificate: webhookInfo.has_custom_certificate,
          pendingUpdateCount: webhookInfo.pending_update_count,
          lastErrorDate: webhookInfo.last_error_date,
          lastErrorMessage: webhookInfo.last_error_message,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        webhook: null,
        error: 'Could not reach Telegram API',
      };
    }
  }

  /**
   * Get decrypted bot token for a location (internal use only).
   */
  async getBotToken(locationId: string): Promise<string | null> {
    const installation = await this.installationModel.findOne({ locationId });
    const config = installation?.telegramConfig;

    if (!config || !config.isActive) return null;
    return this.crypto.decrypt(config.botToken);
  }

  /**
   * Get webhook secret for a location (for Telegram webhook verification).
   */
  async getWebhookSecret(locationId: string): Promise<string | null> {
    const installation = await this.installationModel.findOne({ locationId });
    return installation?.telegramConfig?.webhookSecret || null;
  }
}
