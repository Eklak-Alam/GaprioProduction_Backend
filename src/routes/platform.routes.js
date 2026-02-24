const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platform.controller');

router.get('/auth/google', platformController.googleAuth);
router.get('/auth/google/callback', platformController.googleCallback);

router.get('/auth/slack', platformController.slackAuth);
router.get('/auth/slack/callback', platformController.slackCallback);

router.get('/auth/asana', platformController.asanaAuth);
router.get('/auth/asana/callback', platformController.asanaCallback);

router.get('/auth/miro', platformController.miroAuth);
router.get('/auth/miro/callback', platformController.miroCallback);

router.get('/auth/jira', platformController.jiraAuth);
router.get('/auth/jira/callback', platformController.jiraCallback);

router.get('/auth/zoho', platformController.zohoAuth);
router.get('/auth/zoho/callback', platformController.zohoCallback);

module.exports = router;