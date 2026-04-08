const { Router } = require('express');

function createBillingRouter(billingService, authService) {
  const router = Router();

  // GET /billing/status
  router.get('/status', async (req, res) => {
    try {
      const { companyId, locationId } = req.query;
      const accessToken = await authService.getAccessToken(locationId);
      const hasFunds = await billingService.hasFunds(companyId, accessToken);
      res.json({ success: true, data: { hasFunds } });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // GET /billing/transactions
  router.get('/transactions', async (req, res) => {
    try {
      const { locationId, limit, skip } = req.query;
      const transactions = await billingService.getTransactions(
        locationId,
        limit ? parseInt(limit, 10) : 50,
        skip ? parseInt(skip, 10) : 0,
      );
      res.json({ success: true, data: transactions });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // GET /billing/config — meter prices from GHL
  router.get('/config', async (req, res) => {
    try {
      const { locationId } = req.query;
      const accessToken = await authService.getAccessToken(locationId);
      const config = await billingService.fetchMeterPrices(accessToken, locationId);
      res.json({ success: true, data: config });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // GET /billing/pricing — current pricing and meter IDs
  router.get('/pricing', (req, res) => {
    res.json({ success: true, data: billingService.getPricingConfig() });
  });

  return router;
}

module.exports = { createBillingRouter };
