const { Router } = require('express');

function createAuthRouter(authService) {
  const router = Router();

  // GET /auth/authorize
  router.get('/authorize', async (req, res) => {
    const clientId = process.env.GHL_CLIENT_ID;
    const redirectUri = process.env.GHL_REDIRECT_URI;

    const scopes = [
      'conversations.readonly',
      'conversations.write',
      'conversations/message.readonly',
      'conversations/message.write',
      'contacts.readonly',
      'contacts.write',
      'charges.readonly',
      'charges.write',
      'locations.readonly',
      'oauth.readonly',
      'oauth.write',
      'marketplace-installer-details.readonly',
    ].join(' ');

    let state = '';
    if (req.query.ref || req.query.campaign) {
      const stateData = {};
      if (req.query.ref) stateData.ref = req.query.ref;
      if (req.query.campaign) stateData.campaign = req.query.campaign;
      state = Buffer.from(JSON.stringify(stateData)).toString('base64');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
    });

    if (state) {
      params.set('state', state);
    }

    const url = `https://marketplace.gohighlevel.com/oauth/chooselocation?${params.toString()}`;
    console.log(`Redirecting to GHL OAuth: ref=${req.query.ref || 'none'}`);
    res.redirect(url);
  });

  // GET /auth/callback
  router.get('/callback', async (req, res) => {
    try {
      await authService.handleOAuthCallback(req.query.code, req.query.state);
      res.redirect(`${process.env.FRONTEND_URL}/setup-complete`);
    } catch (error) {
      console.error('OAuth callback failed', error);
      res.status(500).json({
        error: 'OAuth authorization failed. Please try installing again.',
      });
    }
  });

  // POST /auth/sso/decrypt
  router.post('/sso/decrypt', async (req, res) => {
    const { payload } = req.body;
    if (!payload || typeof payload !== 'string') {
      return res.status(400).json({ error: 'payload is required and must be a string' });
    }

    try {
      const userData = authService.decryptSsoPayload(payload);

      res.json({
        success: true,
        data: {
          userId: userData.userId,
          companyId: userData.companyId,
          locationId: userData.activeLocation,
          userName: userData.userName,
          email: userData.email,
          role: userData.role,
        },
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createAuthRouter };
