require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { connectDatabase } = require('./database/connection');

// Services
const CryptoService = require('./crypto/crypto.service');
const AuthService = require('./auth/auth.service');
const TelegramService = require('./telegram/telegram.service');
const GhlService = require('./ghl/ghl.service');
const ContactMappingService = require('./contact-mapping/contact-mapping.service');
const SettingsService = require('./settings/settings.service');
const BillingService = require('./billing/billing.service');
const ReferralService = require('./referral/referral.service');

// Routers
const { createAuthRouter } = require('./auth/auth.router');
const { createSettingsRouter } = require('./settings/settings.router');
const { createWebhooksRouter } = require('./webhooks/webhooks.router');
const { createBillingRouter } = require('./billing/billing.router');
const { createReferralRouter } = require('./referral/referral.router');

// Middleware
const { createSsoMiddleware } = require('./auth/guards/sso.middleware');

async function bootstrap() {
  // Connect to MongoDB
  await connectDatabase();

  // Instantiate services in dependency order
  const cryptoService = new CryptoService();
  const authService = new AuthService(cryptoService);
  const telegramService = new TelegramService();
  const ghlService = new GhlService(authService);
  const contactMappingService = new ContactMappingService(ghlService);
  const settingsService = new SettingsService(cryptoService, telegramService, authService);
  const billingService = new BillingService(authService);
  const referralService = new ReferralService();

  // Create SSO middleware
  const ssoMiddleware = createSsoMiddleware(authService);

  // Create Express app
  const app = express();

  // Global middleware
  app.use(express.json());
  app.use(cors({ origin: true, credentials: true }));

  // Rate limiting for webhook endpoints
  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Health check
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Mount routers
  app.use('/auth', createAuthRouter(authService));
  app.use('/settings', createSettingsRouter(settingsService, ssoMiddleware));
  app.use(
    '/webhooks',
    webhookLimiter,
    createWebhooksRouter(settingsService, telegramService, ghlService, contactMappingService),
  );
  app.use('/billing', createBillingRouter(billingService, authService));
  app.use('/referrals', createReferralRouter(referralService));

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.statusCode || 500).json({
      error: err.message || 'Internal server error',
    });
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`TeleSync server running on port ${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
