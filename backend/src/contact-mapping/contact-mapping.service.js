const ContactMapping = require('../schemas/contact-mapping.schema');

class ContactMappingService {
  constructor(ghlService) {
    this.ghlService = ghlService;
  }

  async getOrCreateContact(locationId, telegramUser, chatId) {
    // Check existing mapping
    const existing = await ContactMapping.findOne({
      locationId,
      telegramChatId: chatId,
    });

    if (existing) {
      return { ghlContactId: existing.ghlContactId, isNew: false };
    }

    // Create new GHL contact
    console.log(
      `Creating new GHL contact for Telegram user: ${telegramUser.first_name} (chat: ${chatId})`,
    );

    const contact = await this.ghlService.createContact(
      locationId,
      telegramUser.first_name,
      telegramUser.last_name,
      {
        tags: ['telegram', 'telesync'],
        customFields: [
          {
            key: 'telegram_username',
            value: telegramUser.username || '',
          },
          {
            key: 'telegram_chat_id',
            value: String(chatId),
          },
        ],
      },
    );

    // Store the mapping
    await ContactMapping.create({
      locationId,
      telegramChatId: chatId,
      ghlContactId: contact.id,
      telegramUsername: telegramUser.username || undefined,
      telegramFirstName: telegramUser.first_name,
    });

    console.log(`Contact mapping created: chat ${chatId} → GHL contact ${contact.id}`);

    return { ghlContactId: contact.id, isNew: true };
  }

  async getTelegramChatId(locationId, ghlContactId) {
    const mapping = await ContactMapping.findOne({
      locationId,
      ghlContactId,
    });

    return mapping?.telegramChatId || null;
  }
}

module.exports = ContactMappingService;
