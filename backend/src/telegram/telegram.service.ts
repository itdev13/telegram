import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { TelegramBotInfo } from '../common/interfaces';

const TELEGRAM_API = 'https://api.telegram.org';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly backendUrl: string;

  constructor(private config: ConfigService) {
    this.backendUrl = this.config.getOrThrow('BACKEND_URL');
  }

  // ── Bot Validation ─────────────────────────────────────────

  async validateBotToken(botToken: string): Promise<TelegramBotInfo> {
    try {
      const res = await axios.get(`${TELEGRAM_API}/bot${botToken}/getMe`);
      return res.data.result as TelegramBotInfo;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        throw new BadRequestException(
          'Invalid bot token. Please check the token from BotFather and try again.',
        );
      }
      throw new BadRequestException('Could not reach Telegram. Please try again.');
    }
  }

  // ── Webhook Management ─────────────────────────────────────

  async setWebhook(botToken: string, locationId: string, webhookSecret: string): Promise<void> {
    const webhookUrl = `${this.backendUrl}/webhooks/telegram/${locationId}`;

    const res = await axios.post(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'edited_message'],
      drop_pending_updates: false,
    });

    if (!res.data.ok) {
      throw new BadRequestException(`Failed to set Telegram webhook: ${res.data.description}`);
    }

    this.logger.log(`Webhook set for location ${locationId}: ${webhookUrl}`);
  }

  async deleteWebhook(botToken: string): Promise<void> {
    try {
      await axios.post(`${TELEGRAM_API}/bot${botToken}/deleteWebhook`, {
        drop_pending_updates: true,
      });
      this.logger.log('Telegram webhook deleted');
    } catch (error) {
      this.logger.warn('Failed to delete Telegram webhook (may already be removed)');
    }
  }

  async getWebhookInfo(botToken: string): Promise<any> {
    const res = await axios.get(`${TELEGRAM_API}/bot${botToken}/getWebhookInfo`);
    return res.data.result;
  }

  // ── Send Messages ──────────────────────────────────────────

  async sendMessage(botToken: string, chatId: number | string, text: string): Promise<number> {
    const res = await this.callTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
    return res.result.message_id;
  }

  async sendPhoto(
    botToken: string,
    chatId: number | string,
    photoUrl: string,
    caption?: string,
  ): Promise<number> {
    const res = await this.callTelegramApi(botToken, 'sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption,
    });
    return res.result.message_id;
  }

  async sendDocument(
    botToken: string,
    chatId: number | string,
    documentUrl: string,
    caption?: string,
  ): Promise<number> {
    const res = await this.callTelegramApi(botToken, 'sendDocument', {
      chat_id: chatId,
      document: documentUrl,
      caption,
    });
    return res.result.message_id;
  }

  // ── File Downloads ─────────────────────────────────────────

  async getFileUrl(botToken: string, fileId: string): Promise<string> {
    const res = await axios.get(`${TELEGRAM_API}/bot${botToken}/getFile?file_id=${fileId}`);
    const filePath = res.data.result.file_path;
    return `${TELEGRAM_API}/file/bot${botToken}/${filePath}`;
  }

  // ── Internal Helper ────────────────────────────────────────

  private async callTelegramApi(
    botToken: string,
    method: string,
    data: any,
    retries = 3,
  ): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await axios.post(`${TELEGRAM_API}/bot${botToken}/${method}`, data);
        return res.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;

        // Don't retry on client errors (except 429 rate limit)
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw error;
        }

        // Rate limited — wait and retry
        if (status === 429) {
          const retryAfter = (axiosError.response?.data as any)?.parameters?.retry_after || 5;
          this.logger.warn(
            `Telegram rate limited, waiting ${retryAfter}s (attempt ${attempt}/${retries})`,
          );
          await this.sleep(retryAfter * 1000);
          continue;
        }

        // Transient error — exponential backoff
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(
            `Telegram API error, retrying in ${delay}ms (attempt ${attempt}/${retries})`,
          );
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
