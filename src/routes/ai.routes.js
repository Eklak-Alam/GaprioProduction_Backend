const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const { protect } = require('../middlewares/auth.middleware');

// 🔒 Protected Routes (User must be logged in)
router.post('/chat', protect, aiController.chatWithAgent);
router.get('/actions', protect, aiController.getPendingActions);
router.post('/approve', protect, aiController.approveAction);

// Health check (no auth needed - for monitoring)
router.get('/health', aiController.getAgentHealth);

module.exports = router;