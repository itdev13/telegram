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
const ConnectionManager = require('./telegram/connection-manager');
const GramJsService = require('./telegram/gramjs.service');

// Routers
const { createAuthRouter } = require('./auth/auth.router');
const { createSettingsRouter } = require('./settings/settings.router');
const { createWebhooksRouter } = require('./webhooks/webhooks.router');
const { createBillingRouter } = require('./billing/billing.router');
const { createReferralRouter } = require('./referral/referral.router');
const { createMediaRouter, cleanupExpiredMedia } = require('./media/media.router');
const { createWorkflowsRouter } = require('./workflows/workflows.router');
const { createSupportRouter } = require('./support/support.router');
const WorkflowsService = require('./workflows/workflows.service');

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
  const connectionManager = new ConnectionManager(cryptoService);
  const workflowsService = new WorkflowsService(contactMappingService, settingsService, telegramService, authService, connectionManager);
  const gramJsService = new GramJsService(
    connectionManager,
    cryptoService,
    ghlService,
    contactMappingService,
    telegramService,
    workflowsService,
  );

  // Create SSO middleware
  const ssoMiddleware = createSsoMiddleware(authService);

  // Create Express app
  const app = express();

  // Trust proxy (behind nginx/cloudflare)
  app.set('trust proxy', 1);

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
  app.use('/settings', createSettingsRouter(settingsService, gramJsService, ssoMiddleware));
  app.use(
    '/webhooks',
    webhookLimiter,
    createWebhooksRouter(
      settingsService,
      telegramService,
      ghlService,
      contactMappingService,
      connectionManager,
      workflowsService,
      billingService,
    ),
  );
  app.use('/billing', createBillingRouter(billingService, authService));
  app.use('/referrals', createReferralRouter(referralService));
  app.use('/media', createMediaRouter());
  app.use('/workflows', createWorkflowsRouter(workflowsService, billingService));
  app.use('/support', createSupportRouter(ssoMiddleware));

  // Clean up expired media files on startup and every 30 minutes
  cleanupExpiredMedia();
  setInterval(cleanupExpiredMedia, 30 * 60 * 1000);

  // Initialize phone connections (staggered reconnect)
  gramJsService.initAllClients().catch((err) => {
    console.error('Failed to initialize phone connections:', err);
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.statusCode || 500).json({
      error: err.message || 'Internal server error',
    });
  });

  // Graceful shutdown — disconnect all GramJS clients
  const shutdown = async () => {
    console.log('Shutting down — disconnecting GramJS clients...');
    await connectionManager.disconnectAll();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`TeleSync server running on port ${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
