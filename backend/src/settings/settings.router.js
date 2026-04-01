const { Router } = require('express');

function createSettingsRouter(settingsService, ssoMiddleware) {
  const router = Router();

  router.use(ssoMiddleware);

  // GET /settings/:locationId
  router.get('/:locationId', async (req, res) => {
    try {
      const result = await settingsService.getConfig(req.params.locationId);
      res.json(result);
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

  return router;
}

module.exports = { createSettingsRouter };
