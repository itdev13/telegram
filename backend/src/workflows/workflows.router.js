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

  // ═══════════════════════════════════════════════════════════
  // BOT ACTIONS (Advanced)
  // ═══════════════════════════════════════════════════════════

  router.post('/actions/send-buttons', async (req, res) => {
    const payload = req.body;
    console.log(`Action send-buttons: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executeSendButtons(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action send-buttons failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/forward-message', async (req, res) => {
    const payload = req.body;
    console.log(`Action forward-message: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executeForwardMessage(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action forward-message failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/edit-message', async (req, res) => {
    const payload = req.body;
    console.log(`Action edit-message: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executeEditMessage(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action edit-message failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/delete-message', async (req, res) => {
    const payload = req.body;
    console.log(`Action delete-message: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executeDeleteMessage(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action delete-message failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // PHONE ACTIONS
  // ═══════════════════════════════════════════════════════════

  router.post('/actions/send-phone-message', async (req, res) => {
    const payload = req.body;
    console.log(`Action send-phone-message: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executeSendPhoneMessage(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action send-phone-message failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/send-to-group', async (req, res) => {
    const payload = req.body;
    console.log(`Action send-to-group: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executeSendToGroup(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action send-to-group failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/send-reaction', async (req, res) => {
    const payload = req.body;
    console.log(`Action send-reaction: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executeSendReaction(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action send-reaction failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/generate-invite-link', async (req, res) => {
    const payload = req.body;
    console.log(`Action generate-invite-link: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executeGenerateInviteLink(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action generate-invite-link failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/pin-message', async (req, res) => {
    const payload = req.body;
    console.log(`Action pin-message: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executePinMessage(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action pin-message failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/actions/edit-group-permissions', async (req, res) => {
    const payload = req.body;
    console.log(`Action edit-group-permissions: location=${payload.extras?.locationId}`);
    try {
      const result = await workflowsService.executeEditGroupPermissions(payload);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error(`Action edit-group-permissions failed: ${error.message}`);
      res.json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = { createWorkflowsRouter };
