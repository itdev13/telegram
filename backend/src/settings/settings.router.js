const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const Installation = require('../schemas/installation.schema');
const PhoneAuthSession = require('../schemas/phone-auth-session.schema');

function createSettingsRouter(settingsService, gramJsService, ssoMiddleware) {
  const router = Router();

  router.use(ssoMiddleware);

  // Per-location rate limiter for phone auth
  const phoneAuthLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 3,
    keyGenerator: (req) => req.params.locationId,
    message: { error: 'Too many code requests. Please wait before trying again.' },
  });

  // GET /settings/:locationId — returns both bot and phone connection status
  router.get('/:locationId', async (req, res) => {
    try {
      const installation = await Installation.findOne({ locationId: req.params.locationId });

      const botConfig = installation?.telegramConfig;
      const phoneConfig = installation?.phoneConfig;

      const botConnected = !!(botConfig && botConfig.isActive);
      const phoneConnected = !!(phoneConfig && phoneConfig.isActive);

      res.json({
        botConnected,
        phoneConnected,
        bot: botConnected
          ? {
              username: botConfig.botUsername,
              id: botConfig.botId,
              isActive: botConfig.isActive,
              connectedAt: botConfig.connectedAt,
            }
          : null,
        phone: phoneConnected
          ? {
              phoneNumber: phoneConfig.phoneNumber,
              telegramUsername: phoneConfig.telegramUsername,
              displayName: phoneConfig.displayName,
              isActive: phoneConfig.isActive,
              connectedAt: phoneConfig.connectedAt,
            }
          : null,
        // backward compat
        connectionType: installation?.connectionType || 'bot',
        connected: botConnected || phoneConnected,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // POST /settings/:locationId/connect
  router.post('/:locationId/connect', async (req, res) => {
    const { botToken } = req.body;
    if (!botToken || typeof botToken !== 'string') {
      return res.status(400).json({ error: 'botToken is required and must be a string' });
    }

    try {
      console.log(`Connecting bot for location: ${req.params.locationId}`);
      const result = await settingsService.connectBot(req.params.locationId, botToken);
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // DELETE /settings/:locationId/disconnect
  router.delete('/:locationId/disconnect', async (req, res) => {
    try {
      console.log(`Disconnecting bot for location: ${req.params.locationId}`);
      const result = await settingsService.disconnectBot(req.params.locationId);
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // GET /settings/:locationId/status
  router.get('/:locationId/status', async (req, res) => {
    try {
      const result = await settingsService.checkStatus(req.params.locationId);
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // ── Phone Auth Endpoints ──────────────────────────────

  // POST /settings/:locationId/phone/send-code
  router.post('/:locationId/phone/send-code', phoneAuthLimiter, async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({ error: 'phoneNumber is required and must be a string' });
    }

    // Basic phone number validation (E.164 format)
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber.trim())) {
      return res.status(400).json({
        error: 'Invalid phone number format. Use international format: +1234567890',
      });
    }

    try {
      const result = await gramJsService.sendCode(req.params.locationId, phoneNumber.trim());
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // POST /settings/:locationId/phone/verify-code
  router.post('/:locationId/phone/verify-code', async (req, res) => {
    const { phoneCode } = req.body;
    if (!phoneCode || typeof phoneCode !== 'string') {
      return res.status(400).json({ error: 'phoneCode is required and must be a string' });
    }

    try {
      const result = await gramJsService.verifyCode(req.params.locationId, phoneCode.trim());
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // POST /settings/:locationId/phone/verify-2fa
  router.post('/:locationId/phone/verify-2fa', async (req, res) => {
    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password is required and must be a string' });
    }

    try {
      const result = await gramJsService.submit2FA(req.params.locationId, password);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // DELETE /settings/:locationId/phone/disconnect
  router.delete('/:locationId/phone/disconnect', async (req, res) => {
    try {
      const locationId = req.params.locationId;

      // Destroy GramJS client
      await gramJsService.destroyClient(locationId);

      // Clear phone config only (preserve bot connection if exists)
      await Installation.updateOne(
        { locationId },
        { phoneConfig: null },
      );

      // Clean up any pending auth sessions
      await PhoneAuthSession.deleteOne({ locationId });

      console.log(`Phone disconnected for location: ${locationId}`);
      res.json({ success: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createSettingsRouter };
