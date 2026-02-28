const express = require('express');
const router = express.Router();

const monitoringController = require('../controllers/monitoring.controller');
const { protect } = require('../middlewares/auth.middleware');

// ==========================================
// 📋 SUGGESTED ACTIONS (Protected)
// ==========================================
router.get('/actions', protect, monitoringController.getActions);
router.get('/actions/count', protect, monitoringController.getActionCount);
router.put('/actions/:id', protect, monitoringController.updateAction);
router.post('/actions/:id/execute', protect, monitoringController.executeAction);
router.post('/actions/:id/reject', protect, monitoringController.rejectAction);

// ==========================================
// 📡 MONITORED CHANNELS (Protected)
// ==========================================
router.get('/channels', protect, monitoringController.getChannels);
router.post('/channels', protect, monitoringController.setChannels);
router.delete('/channels/:id', protect, monitoringController.removeChannel);
router.get('/available-channels', protect, monitoringController.getAvailableChannels);

// ==========================================
// 🔔 WEBHOOKS (No auth - external services call these)
// ==========================================
router.post('/webhooks/asana', monitoringController.asanaWebhook);
router.post('/webhooks/google', monitoringController.googleWebhook);

// ==========================================
// 🔧 INTERNAL (No auth - called by Python agent on localhost)
// ==========================================
router.get('/channels/check/:channelId', monitoringController.checkChannel);
router.post('/internal/analyze', monitoringController.internalAnalyze);

module.exports = router;