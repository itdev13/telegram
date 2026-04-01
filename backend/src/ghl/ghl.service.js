const axios = require('axios');

class GhlService {
  constructor(authService) {
    this.authService = authService;
    this.apiBase = process.env.GHL_API_BASE;
    this.apiVersion = process.env.GHL_API_VERSION;
    if (!this.apiBase) throw new Error('GHL_API_BASE is required');
    if (!this.apiVersion) throw new Error('GHL_API_VERSION is required');
  }

  // ── API Request Wrapper (401 retry + 429 backoff) ───────────

  async _apiRequest(locationId, requestFn) {
    let token = await this.authService.getAccessToken(locationId);
    let lastError;

    // Try with current token, retry once on 401
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this._executeWithBackoff(() => requestFn(token));
      } catch (error) {
        lastError = error;
        if (attempt === 0 && error?.response?.status === 401) {
          console.warn(
            `401 for ${locationId}, refreshing token and retrying` +
              ` | Response: ${JSON.stringify(error?.response?.data)}`,
          );
          token = await this.authService.getAccessToken(locationId);
          continue;
        }
        console.error(
          `GHL API error for ${locationId}` +
            ` | Status: ${error?.response?.status}` +
            ` | Response: ${JSON.stringify(error?.response?.data)}`,
        );
        throw error;
      }
    }

    throw lastError;
  }

  async _executeWithBackoff(fn, maxRetries = 3) {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (error?.response?.status === 429 && attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`429 rate limited, backing off ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  // ── Contacts ───────────────────────────────────────────────

  async createContact(locationId, firstName, lastName, extraFields) {
    const res = await this._apiRequest(locationId, (token) =>
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

    console.log(`Created GHL contact: ${res.data.contact.id}`);
    return res.data.contact;
  }

  async searchContactByCustomField(locationId, fieldKey, value) {
    try {
      const res = await this._apiRequest(locationId, (token) =>
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

  async addInboundMessage(locationId, payload) {
    const res = await this._apiRequest(locationId, (token) =>
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

    console.log(
      `Inbound message added: conversationId=${res.data.conversationId}, messageId=${res.data.messageId}`,
    );

    return {
      conversationId: res.data.conversationId,
      messageId: res.data.messageId,
    };
  }

  // ── Message Status Updates ─────────────────────────────────

  async updateMessageStatus(locationId, messageId, status, error) {
    try {
      await this._apiRequest(locationId, (token) =>
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
      console.log(`Message ${messageId} status updated to: ${status}`);
    } catch (err) {
      console.error(`Failed to update message status: ${messageId}`, err);
    }
  }

  // ── Company Locations ──────────────────────────────────────

  async getCompanyLocations(accessToken, companyId) {
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

module.exports = GhlService;
