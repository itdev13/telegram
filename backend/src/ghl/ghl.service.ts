import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AuthService } from '../auth/auth.service';
import { GhlContact } from '../common/interfaces';

@Injectable()
export class GhlService {
  private readonly logger = new Logger(GhlService.name);
  private readonly apiBase: string;
  private readonly apiVersion: string;

  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {
    this.apiBase = this.config.getOrThrow('GHL_API_BASE');
    this.apiVersion = this.config.getOrThrow('GHL_API_VERSION');
  }

  // ── Contacts ───────────────────────────────────────────────

  async createContact(
    locationId: string,
    firstName: string,
    lastName?: string,
    extraFields?: Record<string, any>,
  ): Promise<GhlContact> {
    const token = await this.authService.getAccessToken(locationId);

    const res = await axios.post(
      `${this.apiBase}/contacts/`,
      {
        locationId,
        firstName,
        lastName: lastName || '',
        source: 'TeleSync - Telegram',
        ...extraFields,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Version: this.apiVersion,
          'Content-Type': 'application/json',
        },
      },
    );

    this.logger.log(`Created GHL contact: ${res.data.contact.id}`);
    return res.data.contact;
  }

  async searchContactByCustomField(
    locationId: string,
    fieldKey: string,
    value: string,
  ): Promise<GhlContact | null> {
    const token = await this.authService.getAccessToken(locationId);

    try {
      const res = await axios.get(`${this.apiBase}/contacts/search`, {
        params: { locationId, query: value },
        headers: {
          Authorization: `Bearer ${token}`,
          Version: this.apiVersion,
        },
      });

      const contacts = res.data.contacts || [];
      return contacts.length > 0 ? contacts[0] : null;
    } catch {
      return null;
    }
  }

  // ── Inbound Messages (Telegram → GHL) ──────────────────────

  async addInboundMessage(
    locationId: string,
    payload: {
      conversationProviderId: string;
      contactId: string;
      message?: string;
      attachments?: string[];
      altId?: string;
    },
  ): Promise<{ conversationId: string; messageId: string }> {
    const token = await this.authService.getAccessToken(locationId);

    const res = await axios.post(
      `${this.apiBase}/conversations/messages/inbound`,
      {
        type: 'Custom',
        ...payload,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Version: this.apiVersion,
          'Content-Type': 'application/json',
        },
      },
    );

    this.logger.log(
      `Inbound message added: conversationId=${res.data.conversationId}, messageId=${res.data.messageId}`,
    );

    return {
      conversationId: res.data.conversationId,
      messageId: res.data.messageId,
    };
  }

  // ── Message Status Updates ─────────────────────────────────

  async updateMessageStatus(
    locationId: string,
    messageId: string,
    status: 'delivered' | 'failed' | 'sent',
    error?: string,
  ): Promise<void> {
    const token = await this.authService.getAccessToken(locationId);

    try {
      await axios.put(
        `${this.apiBase}/conversations/messages/${messageId}/status`,
        {
          status,
          ...(error ? { error } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: this.apiVersion,
            'Content-Type': 'application/json',
          },
        },
      );
      this.logger.log(`Message ${messageId} status updated to: ${status}`);
    } catch (err) {
      this.logger.error(`Failed to update message status: ${messageId}`, err);
    }
  }

}
