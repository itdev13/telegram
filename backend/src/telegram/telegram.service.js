const axios = require('axios');

const TELEGRAM_API = 'https://api.telegram.org';

class TelegramService {
  constructor() {
    this.backendUrl = process.env.BACKEND_URL;
    if (!this.backendUrl) throw new Error('BACKEND_URL is required');
  }

  // ── Bot Validation ─────────────────────────────────────────

  async validateBotToken(botToken) {
    try {
      const res = await axios.get(`${TELEGRAM_API}/bot${botToken}/getMe`);
      return res.data.result;
    } catch (error) {
      if (error.response?.status === 401) {
        const err = new Error(
          'Invalid bot token. Please check the token from BotFather and try again.',
        );
        err.statusCode = 400;
        throw err;
      }
      const err = new Error('Could not reach Telegram. Please try again.');
      err.statusCode = 400;
      throw err;
    }
  }

  // ── Webhook Management ─────────────────────────────────────

  async setWebhook(botToken, locationId, webhookSecret) {
    const webhookUrl = `${this.backendUrl}/webhooks/telegram/${locationId}`;

    const res = await axios.post(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'edited_message'],
      drop_pending_updates: false,
    });

    if (!res.data.ok) {
      const err = new Error(`Failed to set Telegram webhook: ${res.data.description}`);
      err.statusCode = 400;
      throw err;
    }

    console.log(`Webhook set for location ${locationId}: ${webhookUrl}`);
  }

  async deleteWebhook(botToken) {
    try {
      await axios.post(`${TELEGRAM_API}/bot${botToken}/deleteWebhook`, {
        drop_pending_updates: true,
      });
      console.log('Telegram webhook deleted');
    } catch (error) {
      console.warn('Failed to delete Telegram webhook (may already be removed)');
    }
  }

  async getWebhookInfo(botToken) {
    const res = await axios.get(`${TELEGRAM_API}/bot${botToken}/getWebhookInfo`);
    return res.data.result;
  }

  // ── Send Messages ──────────────────────────────────────────

  async sendMessage(botToken, chatId, text, replyToMessageId) {
    const res = await this._callTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...(replyToMessageId ? { reply_parameters: { message_id: Number(replyToMessageId) } } : {}),
    });
    return res.result.message_id;
  }

  async sendPhoto(botToken, chatId, photoUrl, caption) {
    const res = await this._callTelegramApi(botToken, 'sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption,
    });
    return res.result.message_id;
  }

  async sendDocument(botToken, chatId, documentUrl, caption) {
    const res = await this._callTelegramApi(botToken, 'sendDocument', {
      chat_id: chatId,
      document: documentUrl,
      caption,
    });
    return res.result.message_id;
  }

  // ── Advanced Send Methods ─────────────────────────────────

  async sendMessageWithButtons(botToken, chatId, text, inlineKeyboard) {
    const res = await this._callTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
    return res.result.message_id;
  }

  async forwardMessage(botToken, toChatId, fromChatId, messageId) {
    const res = await this._callTelegramApi(botToken, 'forwardMessage', {
      chat_id: toChatId,
      from_chat_id: fromChatId,
      message_id: messageId,
    });
    return res.result.message_id;
  }

  async editMessage(botToken, chatId, messageId, text) {
    const res = await this._callTelegramApi(botToken, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    });
    return res.result.message_id;
  }

  async deleteMessage(botToken, chatId, messageId) {
    await this._callTelegramApi(botToken, 'deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
    return true;
  }

  async pinMessage(botToken, chatId, messageId) {
    await this._callTelegramApi(botToken, 'pinChatMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
    return true;
  }

  async sendReaction(botToken, chatId, messageId, emoji) {
    await this._callTelegramApi(botToken, 'setMessageReaction', {
      chat_id: chatId,
      message_id: Number(messageId),
      reaction: [{ type: 'emoji', emoji }],
    });
    return true;
  }

  async generateInviteLink(botToken, chatId) {
    const res = await this._callTelegramApi(botToken, 'exportChatInviteLink', {
      chat_id: chatId,
    });
    return res.result;
  }

  async setChatPermissions(botToken, chatId, permissions) {
    await this._callTelegramApi(botToken, 'setChatPermissions', {
      chat_id: chatId,
      permissions: {
        can_send_messages: permissions.sendMessages ?? true,
        can_send_photos: permissions.sendMedia ?? true,
        can_send_videos: permissions.sendMedia ?? true,
        can_send_documents: permissions.sendMedia ?? true,
        can_send_other_messages: permissions.sendStickers ?? true,
        can_add_web_page_previews: permissions.embedLinks ?? true,
        can_send_polls: permissions.sendPolls ?? true,
        can_change_info: permissions.changeInfo ?? false,
        can_invite_users: permissions.inviteUsers ?? true,
        can_pin_messages: permissions.pinMessages ?? true,
      },
    });
    return true;
  }

  // ── File Downloads ─────────────────────────────────────────

  async getFileUrl(botToken, fileId) {
    const res = await axios.get(`${TELEGRAM_API}/bot${botToken}/getFile?file_id=${fileId}`);
    const filePath = res.data.result.file_path;
    return `${TELEGRAM_API}/file/bot${botToken}/${filePath}`;
  }

  // ── Internal Helper ────────────────────────────────────────

  async _callTelegramApi(botToken, method, data, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await axios.post(`${TELEGRAM_API}/bot${botToken}/${method}`, data);
        return res.data;
      } catch (error) {
        const status = error.response?.status;

        // Don't retry on client errors (except 429 rate limit)
        if (status && status >= 400 && status < 500 && status !== 429) {
          const description = error.response?.data?.description || 'no description';
          console.error(`[TelegramService] ${method} failed ${status}: ${description} | payload=${JSON.stringify(data)}`);
          throw error;
        }

        // Rate limited — wait and retry
        if (status === 429) {
          const retryAfter = error.response?.data?.parameters?.retry_after || 5;
          console.warn(
            `Telegram rate limited, waiting ${retryAfter}s (attempt ${attempt}/${retries})`,
          );
          await this._sleep(retryAfter * 1000);
          continue;
        }

        // Transient error — exponential backoff
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(
            `Telegram API error, retrying in ${delay}ms (attempt ${attempt}/${retries})`,
          );
          await this._sleep(delay);
        } else {
          throw error;
        }
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = TelegramService;
