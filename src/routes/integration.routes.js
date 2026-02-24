const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth.middleware');
const integrationController = require('../controllers/integration.controller');

// ===========================
// 🟢 GOOGLE ROUTES
// ===========================
router.get('/google/dashboard', protect, integrationController.getGoogleData);
router.post('/google/email/send', protect, integrationController.sendEmail);
router.post('/google/email/draft', protect, integrationController.createDraft);
router.post('/google/calendar/create', protect, integrationController.createMeeting);

// 🟣 SLACK ROUTES
// ===========================
router.get('/slack/channels', protect, integrationController.getSlackData);
router.get('/slack/users', protect, integrationController.getSlackUsers);
router.get('/slack/workspace-users', protect, integrationController.getSlackWorkspaceUsers);
router.get('/slack/dms', protect, integrationController.getSlackDMs);
router.get('/slack/channels/:channelId/messages', protect, integrationController.getSlackMessages);
router.get('/slack/threads/:channelId/:threadTs', protect, integrationController.getSlackThread);
router.post('/slack/message', protect, integrationController.sendSlackMessage);
router.post('/slack/reactions', protect, integrationController.addSlackReaction);
router.post('/slack/ai-chat', protect, integrationController.slackAIChat);

// ===========================
// 🟠 ASANA ROUTES
// ===========================
router.get('/asana/dashboard', protect, integrationController.getAsanaData);
router.post('/asana/tasks', protect, integrationController.createAsanaTask);
router.put('/asana/tasks/:taskId/complete', protect, integrationController.completeAsanaTask);

// ===========================
// 🎨 MIRO ROUTES
// ===========================
router.get('/miro/boards', protect, integrationController.getMiroData);
router.post('/miro/boards', protect, integrationController.createMiroBoard);

// ===========================
// 🐞 JIRA ROUTES
// ===========================
router.get('/jira/issues', protect, integrationController.getJiraData);
router.post('/jira/issues', protect, integrationController.createJiraIssue);
router.post('/jira/issues/:issueKey/comment', protect, integrationController.addJiraComment);

// ===========================
// 💼 ZOHO ROUTES
// ===========================
router.get('/zoho/deals', protect, integrationController.getZohoData);
router.post('/zoho/deals', protect, integrationController.createZohoDeal);
router.post('/zoho/leads', protect, integrationController.createZohoLead);

// ===========================
// 🔌 DISCONNECT
// ===========================
router.delete('/disconnect/:provider', protect, integrationController.disconnectProvider);

module.exports = router;