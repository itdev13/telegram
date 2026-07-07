const { Router } = require('express');

function createBillingRouter(billingService, authService) {
  const router = Router();

  // GET /billing/status
  router.get('/status', async (req, res) => {
    // No caching — a 304 here would return a stale wallet status after a recharge.
    res.set('Cache-Control', 'no-store');

    const { companyId, locationId } = req.query;
    console.log(`[Billing] /status requested | locationId=${locationId} companyId=${companyId}`);
    try {
      const accessToken = await authService.getAccessToken(locationId);
      const hasFunds = await billingService.hasFunds(companyId, accessToken);
      console.log(`[Billing] /status hasFunds=${hasFunds} | locationId=${locationId}`);

      // If funds are back, clear any stale suspension so the UI banner and sync
      // resume immediately (rather than waiting for the next message to retry).
      if (hasFunds) {
        const cleared = await billingService._clearWalletSuspension(locationId);
        if (cleared) {
          console.log(`[Billing] /status cleared prior suspension | locationId=${locationId}`);
        }
      }

      const wallet = await billingService.getWalletStatus(locationId);
      console.log(
        `[Billing] /status result | locationId=${locationId} walletStatus=${wallet.walletStatus} scope=${wallet.walletScope || 'none'}`,
      );
      res.json({ success: true, data: { hasFunds, ...wallet } });
    } catch (error) {
      console.error(`[Billing] /status failed | locationId=${locationId} | ${error.message}`);
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
