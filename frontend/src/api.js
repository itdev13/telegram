export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
export const IS_DEV = import.meta.env.DEV;

export const api = {
  async call(method, path, ssoPayload, body) {
    if (IS_DEV) return this.mockCall(method, path, body);

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-SSO-Payload': ssoPayload,
        'ngrok-skip-browser-warning': 'true',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async mockCall(method, path, body) {
    await new Promise((r) => setTimeout(r, 1500));

    if (path.includes('/connect')) {
      const token = body?.botToken || '';
      if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(token.trim())) {
        throw new Error('Invalid bot token. Check the token from BotFather.');
      }
      return {
        connected: true,
        bot: {
          username: 'AcmeSupportBot',
          id: '7123456789',
          isActive: true,
          connectedAt: new Date().toISOString(),
        },
      };
    }

    if (path.includes('/disconnect')) {
      return { success: true };
    }

    if (path.includes('/status')) {
      return {
        status: 'connected',
        webhook: {
          url: 'https://your-server.com/webhooks/telegram/dev_location_001',
          pendingUpdateCount: 0,
          lastErrorDate: null,
          lastErrorMessage: null,
        },
      };
    }

    if (path.includes('/phone/send-code')) {
      return { success: true, data: { phoneCodeHash: 'mock_hash_123' } };
    }

    if (path.includes('/phone/verify-code')) {
      return {
        success: true,
        data: {
          connected: true,
          user: {
            telegramUserId: '123456789',
            telegramUsername: 'JohnFromAcme',
            displayName: 'John Smith',
            phoneNumber: body?.phoneNumber || '+1234567890',
          },
        },
      };
    }

    if (path.includes('/phone/verify-2fa')) {
      return {
        success: true,
        data: {
          connected: true,
          user: {
            telegramUserId: '123456789',
            telegramUsername: 'JohnFromAcme',
            displayName: 'John Smith',
            phoneNumber: '+1234567890',
          },
        },
      };
    }

    // GET config (multi-connection)
    return { botConnected: false, phoneConnected: false, bot: null, phone: null };
  },
};
