const { Router } = require('express');

function createReferralRouter(referralService) {
  const router = Router();

  // GET /referrals/stats
  router.get('/stats', async (req, res) => {
    try {
      const stats = await referralService.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // GET /referrals/installs/:referralCode
  router.get('/installs/:referralCode', async (req, res) => {
    try {
      const installs = await referralService.getInstallsByCode(req.params.referralCode);
      res.json({ success: true, data: installs });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // POST /referrals/influencer
  router.post('/influencer', async (req, res) => {
    try {
      const { referralCode, ...influencer } = req.body;
      const result = await referralService.registerInfluencer(referralCode, influencer);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // GET /referrals/link
  router.get('/link', async (req, res) => {
    try {
      const { referralCode, campaign } = req.query;
      const link = await referralService.generateInstallLink(referralCode, campaign);
      res.json({ success: true, data: { url: link } });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createReferralRouter };
