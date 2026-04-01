import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import {
  WorkflowSubscription,
  WorkflowSubscriptionDocument,
} from '../schemas/workflow-subscription.schema';
import { ContactMappingService } from '../contact-mapping/contact-mapping.service';
import { SettingsService } from '../settings/settings.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  GhlTriggerSubscriptionPayload,
  GhlActionPayload,
  TriggerEventPayload,
} from '../common/interfaces';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @InjectModel(WorkflowSubscription.name)
    private subscriptionModel: Model<WorkflowSubscriptionDocument>,
    private contactMapping: ContactMappingService,
    private settings: SettingsService,
    private telegram: TelegramService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // TRIGGER SUBSCRIPTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async handleSubscription(
    payload: GhlTriggerSubscriptionPayload,
  ): Promise<{ success: boolean }> {
    const { triggerData, extras, meta } = payload;
    const { eventType, targetUrl, filters } = triggerData;
    const { locationId, workflowId, companyId } = extras;
    const triggerKey = meta.key;

    this.logger.log(
      `Trigger subscription ${eventType}: key=${triggerKey}, workflow=${workflowId}, location=${locationId}`,
    );

    switch (eventType) {
      case 'CREATED':
      case 'UPDATED':
        await this.subscriptionModel.findOneAndUpdate(
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
        this.logger.log(
          `Subscription upserted: ${triggerKey} for workflow ${workflowId}`,
        );
        break;

      case 'DELETED':
        await this.subscriptionModel.findOneAndUpdate(
          { workflowId, triggerKey },
          { status: 'deleted' },
        );
        this.logger.log(
          `Subscription deleted: ${triggerKey} for workflow ${workflowId}`,
        );
        break;

      default:
        this.logger.warn(`Unknown subscription event type: ${eventType}`);
    }

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════
  // TRIGGER FIRING
  // ═══════════════════════════════════════════════════════════

  async fireTrigger(
    triggerKey: string,
    locationId: string,
    eventData: TriggerEventPayload,
  ): Promise<void> {
    try {
      const subscriptions = await this.subscriptionModel.find({
        locationId,
        triggerKey,
        status: 'active',
      });

      if (subscriptions.length === 0) {
        return;
      }

      this.logger.log(
        `Firing trigger ${triggerKey} for location ${locationId} → ${subscriptions.length} subscription(s)`,
      );

      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          this.postToTargetUrl(sub.targetUrl, eventData),
        ),
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'rejected') {
          this.logger.error(
            `Failed to fire trigger to workflow ${subscriptions[i].workflowId}: ${result.reason?.message || result.reason}`,
          );
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error firing trigger ${triggerKey}: ${error.message}`,
      );
    }
  }

  private async postToTargetUrl(
    targetUrl: string,
    eventData: TriggerEventPayload,
  ): Promise<void> {
    await axios.post(targetUrl, eventData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ACTION EXECUTION
  // ═══════════════════════════════════════════════════════════

  async executeSendMessage(
    payload: GhlActionPayload,
  ): Promise<{ messageId: number; status: string; telegramChatId: number }> {
    const { locationId, contactId } = payload.extras;
    const { message } = payload.data;

    if (!message) {
      throw new Error('Message text is required');
    }

    const { botToken, chatId } = await this.resolveContact(
      locationId,
      contactId,
    );

    const messageId = await this.telegram.sendMessage(botToken, chatId, message);

    this.logger.log(
      `Workflow action: sent message to chat ${chatId}, messageId=${messageId}`,
    );

    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeSendPhoto(
    payload: GhlActionPayload,
  ): Promise<{ messageId: number; status: string; telegramChatId: number }> {
    const { locationId, contactId } = payload.extras;
    const { photoUrl, caption } = payload.data;

    if (!photoUrl) {
      throw new Error('Photo URL is required');
    }

    const { botToken, chatId } = await this.resolveContact(
      locationId,
      contactId,
    );

    const messageId = await this.telegram.sendPhoto(
      botToken,
      chatId,
      photoUrl,
      caption || undefined,
    );

    this.logger.log(
      `Workflow action: sent photo to chat ${chatId}, messageId=${messageId}`,
    );

    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  async executeSendDocument(
    payload: GhlActionPayload,
  ): Promise<{ messageId: number; status: string; telegramChatId: number }> {
    const { locationId, contactId } = payload.extras;
    const { documentUrl, caption } = payload.data;

    if (!documentUrl) {
      throw new Error('Document URL is required');
    }

    const { botToken, chatId } = await this.resolveContact(
      locationId,
      contactId,
    );

    const messageId = await this.telegram.sendDocument(
      botToken,
      chatId,
      documentUrl,
      caption || undefined,
    );

    this.logger.log(
      `Workflow action: sent document to chat ${chatId}, messageId=${messageId}`,
    );

    return { messageId, status: 'sent', telegramChatId: chatId };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  private async resolveContact(
    locationId: string,
    contactId: string,
  ): Promise<{ botToken: string; chatId: number }> {
    const chatId = await this.contactMapping.getTelegramChatId(
      locationId,
      contactId,
    );

    if (!chatId) {
      throw new Error(
        'Contact has no Telegram mapping. The user must message the bot first.',
      );
    }

    const botToken = await this.settings.getBotToken(locationId);

    if (!botToken) {
      throw new Error('No Telegram bot configured for this location.');
    }

    return { botToken, chatId };
  }
}
