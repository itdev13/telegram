const Installation = require('../schemas/installation.schema');
const CompanyLocation = require('../schemas/company-location.schema');

class SettingsService {
  constructor(cryptoService, telegramService, authService) {
    this.crypto = cryptoService;
    this.telegram = telegramService;
    this.authService = authService;
  }

  async getConfig(locationId) {
    const installation = await Installation.findOne({ locationId });
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

  async connectBot(locationId, botToken) {
    // Step 1: Validate the bot token with Telegram
    const botInfo = await this.telegram.validateBotToken(botToken);

    // Step 2: Check if this location already has a config — disconnect old bot
    const installation = await Installation.findOne({ locationId });
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

    const telegramConfig = {
      botToken: encryptedToken,
      botUsername: botInfo.username,
      botId: botInfo.id,
      webhookSecret,
      isActive: true,
      createdAt: installation?.telegramConfig?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    if (installation) {
      await Installation.updateOne({ locationId }, { telegramConfig });
    } else {
      const setOnInsert = {
        locationId,
        status: 'active',
        installedAt: new Date(),
        conversationProviderId: process.env.GHL_CONVERSATION_PROVIDER_ID || '',
      };

      // Try to generate GHL location token from company token
      const companyLocation = await CompanyLocation.findOne({
        locationIds: locationId,
      });

      if (companyLocation) {
        try {
          const locationToken = await this.authService.generateLocationToken(
            companyLocation.companyId,
            locationId,
          );
          const expiresAt = new Date(Date.now() + locationToken.expiresIn * 1000);

          setOnInsert.companyId = companyLocation.companyId;
          setOnInsert.accessToken = this.crypto.encrypt(locationToken.accessToken);
          setOnInsert.refreshToken = this.crypto.encrypt(locationToken.refreshToken);
          setOnInsert.tokenExpiresAt = expiresAt;

          console.log(`Location token generated for ${locationId}`);
        } catch (error) {
          console.warn(
            `Could not generate location token for ${locationId}, will be generated lazily`,
            error.message,
          );
        }
      }

      await Installation.findOneAndUpdate(
        { locationId },
        { telegramConfig, $setOnInsert: setOnInsert },
        { upsert: true },
      );
    }

    console.log(`Bot @${botInfo.username} connected for location: ${locationId}`);

    return {
      connected: true,
      bot: {
        username: botInfo.username,
        id: botInfo.id.toString(),
        isActive: true,
      },
    };
  }

  async disconnectBot(locationId) {
    const installation = await Installation.findOne({ locationId });
    const config = installation?.telegramConfig;

    if (!config) {
      const err = new Error('No Telegram bot configured for this location');
      err.statusCode = 404;
      throw err;
    }

    const botToken = this.crypto.decrypt(config.botToken);
    await this.telegram.deleteWebhook(botToken);

    await Installation.updateOne({ locationId }, { telegramConfig: null });

    console.log(`Bot disconnected for location: ${locationId}`);

    return { connected: false, bot: null };
  }

  async checkStatus(locationId) {
    const installation = await Installation.findOne({ locationId });
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
      console.error(`[Settings] Failed to fetch webhook info for location ${locationId}: ${error.message}`);
      return {
        status: 'error',
        webhook: null,
        error: 'Could not reach Telegram API',
      };
    }
  }

  async getBotToken(locationId) {
    const installation = await Installation.findOne({ locationId });
    const config = installation?.telegramConfig;

    if (!config || !config.isActive) return null;
    return this.crypto.decrypt(config.botToken);
  }

  async getWebhookSecret(locationId) {
    const installation = await Installation.findOne({ locationId });
    return installation?.telegramConfig?.webhookSecret || null;
  }
}

module.exports = SettingsService;
