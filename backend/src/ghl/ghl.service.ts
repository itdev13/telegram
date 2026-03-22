import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
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

  // ── API Request Wrapper (401 retry + 429 backoff) ───────────

  private async apiRequest<T = any>(
    locationId: string,
    requestFn: (token: string) => Promise<AxiosResponse<T>>,
  ): Promise<AxiosResponse<T>> {
    let token = await this.authService.getAccessToken(locationId);
    let lastError: any;

    // Try with current token, retry once on 401
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.executeWithBackoff(() => requestFn(token));
      } catch (error: any) {
        lastError = error;
        if (attempt === 0 && error?.response?.status === 401) {
          this.logger.warn(
            `401 for ${locationId}, refreshing token and retrying` +
              ` | Response: ${JSON.stringify(error?.response?.data)}`,
          );
          token = await this.authService.getAccessToken(locationId);
          continue;
        }
        this.logger.error(
          `GHL API error for ${locationId}` +
            ` | Status: ${error?.response?.status}` +
            ` | Response: ${JSON.stringify(error?.response?.data)}`,
        );
        throw error;
      }
    }

    throw lastError;
  }

  private async executeWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (error?.response?.status === 429 && attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          this.logger.warn(`429 rate limited, backing off ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  // ── Contacts ───────────────────────────────────────────────

  async createContact(
    locationId: string,
    firstName: string,
    lastName?: string,
    extraFields?: Record<string, any>,
  ): Promise<GhlContact> {
    const res = await this.apiRequest(locationId, (token) =>
      axios.post(
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
      ),
    );

    this.logger.log(`Created GHL contact: ${res.data.contact.id}`);
    return res.data.contact;
  }

  async searchContactByCustomField(
    locationId: string,
    fieldKey: string,
    value: string,
  ): Promise<GhlContact | null> {
    try {
      const res = await this.apiRequest(locationId, (token) =>
        axios.get(`${this.apiBase}/contacts/search`, {
          params: { locationId, query: value },
          headers: {
            Authorization: `Bearer ${token}`,
            Version: this.apiVersion,
          },
        }),
      );

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
    const res = await this.apiRequest(locationId, (token) =>
      axios.post(
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
      ),
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
    try {
      await this.apiRequest(locationId, (token) =>
        axios.put(
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
        ),
      );
      this.logger.log(`Message ${messageId} status updated to: ${status}`);
    } catch (err) {
      this.logger.error(`Failed to update message status: ${messageId}`, err);
    }
  }

  // ── Company Locations ──────────────────────────────────────

  async getCompanyLocations(
    accessToken: string,
    companyId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const res = await axios.get(`${this.apiBase}/locations/search`, {
      params: { companyId },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: this.apiVersion,
      },
    });

    return res.data.locations || [];
  }
}
