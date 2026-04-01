const { Router } = require('express');

function createWorkflowsRouter(workflowsService) {
  const router = Router();

  // ═══════════════════════════════════════════════════════════
  // HEALTH CHECK - verify this route is reachable
  // ═══════════════════════════════════════════════════════════

  router.get('/health', (req, res) => {
    console.log('[Workflows] Health check hit');
    res.json({ status: 'ok', module: 'workflows' });
  });

  // ═══════════════════════════════════════════════════════════
  // TRIGGER SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════

  router.post('/triggers/subscriptions', async (req, res) => {
    const payload = req.body;

    console.log(
      `Trigger subscription received: ${payload.triggerData?.eventType} for key=${payload.meta?.key}`,
    );

    try {
      const result = await workflowsService.handleSubscription(payload);
      res.json(result);
    } catch (error) {
      console.error(`Trigger subscription failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════

  router.post('/actions/send-message', async (req, res) => {
    const payload = req.body;

    console.log(
      `Action send-message: location=${payload.extras?.locationId}, contact=${payload.extras?.contactId}`,
    );

    try {
      const result = await workflowsService.executeSendMessage(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action send-message failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/send-photo', async (req, res) => {
    const payload = req.body;

    console.log(
      `Action send-photo: location=${payload.extras?.locationId}, contact=${payload.extras?.contactId}`,
    );

    try {
      const result = await workflowsService.executeSendPhoto(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action send-photo failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/send-document', async (req, res) => {
    const payload = req.body;

    console.log(
      `Action send-document: location=${payload.extras?.locationId}, contact=${payload.extras?.contactId}`,
    );

    try {
      const result = await workflowsService.executeSendDocument(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action send-document failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = { createWorkflowsRouter };
