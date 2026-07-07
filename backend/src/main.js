require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { connectDatabase } = require('./database/connection');
const Installation = require('./schemas/installation.schema');
const { formatError } = require('./utils/format-error');

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
    billingService,
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

  // Admin stats — install counts. Guarded by ADMIN_API_KEY header.
  // "Installed locations" = exactly the locations that installed the app (one
  // Installation row each), NOT all sub-accounts in an agency.
  app.get('/admin/stats', async (req, res) => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey || req.get('X-Admin-Key') !== adminKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const [totalInstalled, connected, botConnected, phoneConnected, bothConnected] =
        await Promise.all([
          Installation.countDocuments({ status: 'active' }),
          Installation.countDocuments({
            status: 'active',
            $or: [{ telegramConfig: { $ne: null } }, { 'phoneConfig.isActive': true }],
          }),
          Installation.countDocuments({ status: 'active', telegramConfig: { $ne: null } }),
          Installation.countDocuments({ status: 'active', 'phoneConfig.isActive': true }),
          Installation.countDocuments({
            status: 'active',
            telegramConfig: { $ne: null },
            'phoneConfig.isActive': true,
          }),
        ]);
      res.json({
        success: true,
        data: {
          totalInstalled, // count you asked for: installed locations
          connected, // installed AND actually using bot/phone
          notConnected: totalInstalled - connected,
          byType: { bot: botConnected, phone: phoneConnected, both: bothConnected },
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
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
    console.error(`Failed to initialize phone connections | ${formatError(err)}`);
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error(`Unhandled error | ${formatError(err)}`);
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
