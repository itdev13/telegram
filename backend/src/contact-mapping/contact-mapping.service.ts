import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContactMapping, ContactMappingDocument } from '../schemas/contact-mapping.schema';
import { GhlService } from '../ghl/ghl.service';
import { TelegramUser, ContactMappingResult } from '../common/interfaces';

@Injectable()
export class ContactMappingService {
  private readonly logger = new Logger(ContactMappingService.name);

  constructor(
    @InjectModel(ContactMapping.name)
    private contactMappingModel: Model<ContactMappingDocument>,
    private ghlService: GhlService,
  ) {}

  /**
   * Get or create a GHL contact for a Telegram user.
   * If no mapping exists, creates a new GHL contact and stores the mapping.
   */
  async getOrCreateContact(
    locationId: string,
    telegramUser: TelegramUser,
    chatId: number,
  ): Promise<ContactMappingResult> {
    // Check existing mapping
    const existing = await this.contactMappingModel.findOne({
      locationId,
      telegramChatId: chatId,
    });

    if (existing) {
      return { ghlContactId: existing.ghlContactId, isNew: false };
    }

    // Create new GHL contact
    this.logger.log(
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
    await this.contactMappingModel.create({
      locationId,
      telegramChatId: chatId,
      ghlContactId: contact.id,
      telegramUsername: telegramUser.username || undefined,
      telegramFirstName: telegramUser.first_name,
    });

    this.logger.log(`Contact mapping created: chat ${chatId} → GHL contact ${contact.id}`);

    return { ghlContactId: contact.id, isNew: true };
  }

  /**
   * Look up the Telegram chat ID for a GHL contact.
   * Used when forwarding outbound messages from GHL to Telegram.
   */
  async getTelegramChatId(locationId: string, ghlContactId: string): Promise<number | null> {
    const mapping = await this.contactMappingModel.findOne({
      locationId,
      ghlContactId,
    });

    return mapping?.telegramChatId || null;
  }
}
