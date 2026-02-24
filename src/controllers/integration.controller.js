const GoogleService = require('../services/providers/google.service');
const SlackService = require('../services/providers/slack.service');
const AsanaService = require('../services/providers/asana.service');
const MiroService = require('../services/providers/miro.service');
const JiraService = require('../services/providers/jira.service');
const ZohoService = require('../services/providers/zoho.service');
const User = require('../models/user.model');
const Connection = require('../models/connection.model');
const axios = require('axios');

const AGENT_URL = process.env.AI_AGENT_URL || 'http://localhost:8000';

// ==========================================
// 🟢 GOOGLE WORKSPACE
// ==========================================

exports.getGoogleData = async (req, res, next) => {
    try {
        const [emails, files, meetings] = await Promise.all([
            GoogleService.getRecentEmails(req.user.id),
            GoogleService.getRecentFiles(req.user.id),
            GoogleService.getUpcomingMeetings(req.user.id)
        ]);
        res.status(200).json({ success: true, data: { emails, files, meetings } });
    } catch (error) {
        // Return empty data instead of 500 to keep dashboard alive
        console.error("Google Data Error:", error.message);
        res.status(200).json({ success: true, data: { emails: [], files: [], meetings: [] } });
    }
};

exports.sendEmail = async (req, res, next) => {
    try {
        await GoogleService.sendEmail(req.user.id, req.body);
        res.status(200).json({ success: true, message: 'Email sent successfully' });
    } catch (error) { next(error); }
};

exports.createDraft = async (req, res, next) => {
    try {
        const result = await GoogleService.createDraft(req.user.id, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
};

exports.createMeeting = async (req, res, next) => {
    try {
        const result = await GoogleService.createMeeting(req.user.id, req.body);
        res.status(200).json({ success: true, data: result, message: 'Meeting scheduled' });
    } catch (error) { next(error); }
};

// ==========================================
// 🟣 SLACK
// ==========================================

exports.getSlackData = async (req, res, next) => {
    try {
        const channels = await SlackService.getChannels(req.user.id);
        res.status(200).json({ success: true, data: { channels } });
    } catch (error) {
        console.error("Slack Data Error:", error.message);
        res.status(200).json({ success: true, data: { channels: [] } });
    }
};

exports.getSlackUsers = async (req, res, next) => {
    try {
        const users = await SlackService.getWorkspaceUsers(req.user.id);
        res.status(200).json({ success: true, data: users });
    } catch (error) { next(error); }
};

exports.getSlackWorkspaceUsers = async (req, res, next) => {
    try {
        const users = await SlackService.getWorkspaceUsers(req.user.id);
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        console.error("Slack Workspace Users Error:", error.message);
        res.status(200).json({ success: true, data: [] });
    }
};

exports.getSlackDMs = async (req, res, next) => {
    try {
        const dms = await SlackService.getDMs(req.user.id);
        res.status(200).json({ success: true, data: dms });
    } catch (error) {
        console.error("Slack DMs Error:", error.message);
        res.status(200).json({ success: true, data: [] });
    }
};

exports.getSlackMessages = async (req, res, next) => {
    try {
        const { channelId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const data = await SlackService.getMessageHistory(req.user.id, channelId, limit);
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("Slack Messages Error:", error.message);
        res.status(200).json({ success: true, data: { messages: [], hasMore: false } });
    }
};

exports.getSlackThread = async (req, res, next) => {
    try {
        const { channelId, threadTs } = req.params;
        const messages = await SlackService.getThreadReplies(req.user.id, channelId, threadTs);
        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error("Slack Thread Error:", error.message);
        res.status(200).json({ success: true, data: [] });
    }
};

exports.sendSlackMessage = async (req, res, next) => {
    try {
        // Look up the user's real name so the Slack message shows their identity
        const user = await User.findById(req.user.id);
        const senderName = user?.full_name || req.user.email?.split('@')[0] || undefined;

        const result = await SlackService.sendMessage(req.user.id, {
            ...req.body,
            username: senderName,
        });
        res.status(200).json({ success: true, message: 'Message sent', data: result });
    } catch (error) { next(error); }
};

exports.addSlackReaction = async (req, res, next) => {
    try {
        await SlackService.addReaction(req.user.id, req.body);
        res.status(200).json({ success: true, message: 'Reaction added' });
    } catch (error) { next(error); }
};

// 🤖 Slack AI Chat — Bridge between Slack and Gaprio Agent
exports.slackAIChat = async (req, res, next) => {
    try {
        const { channelId, message, channelName } = req.body;
        const userId = req.user.id;

        // Look up the user's real name
        const user = await User.findById(userId);
        const senderName = user?.full_name || req.user.email?.split('@')[0] || 'User';

        // 1. Send the user's message to the Slack channel (with user's name)
        const sentMsg = await SlackService.sendMessage(userId, {
            channelId,
            text: message,
            username: senderName,
        });

        // 2. Route the message to the Gaprio AI Agent
        //    Clean the message: strip Slack user/channel mentions like <@U123> and <#C123|name>
        let cleanMessage = message
            .replace(/<@[A-Z0-9]+>/g, '')
            .replace(/<#([A-Z0-9]+)\|?([^>]*)>/g, (_, id, name) => `#${name || id}`)
            .trim();

        let aiResponse;
        try {
            const agentResult = await axios.post(`${AGENT_URL}/ask-agent`, {
                user_id: userId,
                message: cleanMessage
            }, { timeout: 120000 });

            aiResponse = agentResult.data?.message || 'I processed your request.';

            // Clean up raw API output from the response
            aiResponse = aiResponse
                .replace(/Timestamp:\s*[\d.]+/g, '')
                .replace(/<#([A-Z0-9]+)\|?([^>]*)>/g, (_, id, name) => `#${name || 'channel'}`)
                .replace(/\n{3,}/g, '\n\n')
                .trim();

        } catch (agentError) {
            if (agentError.code === 'ECONNREFUSED') {
                aiResponse = '⚠️ Gaprio AI is currently offline. Your message was sent to Slack but the AI could not process it.';
            } else if (agentError.code === 'ECONNABORTED') {
                aiResponse = '⏳ The AI is still processing your request. Check Slack for updates shortly.';
            } else {
                console.error("Agent Error:", agentError.message);
                aiResponse = '⚠️ AI processing failed. Your message was still sent to Slack.';
            }
        }

        // 3. Post the AI response to the same channel as a reply
        const aiReply = await SlackService.sendMessage(userId, {
            channelId,
            text: `🧠 *Gaprio AI:*\n${aiResponse}`,
            threadTs: sentMsg?.ts || null  // Reply in thread if possible
        });

        res.status(200).json({
            success: true,
            data: {
                userMessage: sentMsg,
                aiResponse: aiResponse,
                aiReply: aiReply
            }
        });

    } catch (error) {
        console.error("Slack AI Chat Error:", error.message);
        res.status(200).json({
            success: true,
            data: { aiResponse: '⚠️ Failed to process. Please try again.' }
        });
    }
};

// ==========================================
// 🟠 ASANA
// ==========================================

exports.getAsanaData = async (req, res, next) => {
    try {
        const [projects, tasks] = await Promise.all([
            AsanaService.getProjects(req.user.id),
            AsanaService.getTasks(req.user.id)
        ]);
        res.status(200).json({ success: true, data: { projects, tasks } });
    } catch (error) {
        console.error("Asana Data Error:", error.message);
        res.status(200).json({ success: true, data: { projects: [], tasks: [] } });
    }
};

exports.createAsanaTask = async (req, res, next) => {
    try {
        const task = await AsanaService.createTask(req.user.id, req.body);
        res.status(200).json({ success: true, data: task });
    } catch (error) { next(error); }
};

exports.completeAsanaTask = async (req, res, next) => {
    try {
        await AsanaService.completeTask(req.user.id, req.params.taskId);
        res.status(200).json({ success: true, message: 'Task completed' });
    } catch (error) { next(error); }
};

// ==========================================
// 🎨 MIRO
// ==========================================

exports.getMiroData = async (req, res, next) => {
    try {
        const boards = await MiroService.getBoards(req.user.id);
        res.status(200).json({ success: true, data: { boards } });
    } catch (error) {
        console.error("Miro Data Error:", error.message);
        res.status(200).json({ success: true, data: { boards: [] } });
    }
};

exports.createMiroBoard = async (req, res, next) => {
    try {
        const board = await MiroService.createBoard(req.user.id, req.body);
        res.status(200).json({ success: true, data: board });
    } catch (error) { next(error); }
};

// ==========================================
// 🐞 JIRA
// ==========================================

exports.getJiraData = async (req, res, next) => {
    try {
        const issues = await JiraService.getIssues(req.user.id);
        res.status(200).json({ success: true, data: { issues } });
    } catch (error) {
        console.error("Jira Data Error:", error.message);
        res.status(200).json({ success: true, data: { issues: [] } });
    }
};

exports.createJiraIssue = async (req, res, next) => {
    try {
        const issue = await JiraService.createIssue(req.user.id, req.body);
        res.status(200).json({ success: true, data: issue });
    } catch (error) { next(error); }
};

exports.addJiraComment = async (req, res, next) => {
    try {
        await JiraService.addComment(req.user.id, req.params.issueKey, req.body.comment);
        res.status(200).json({ success: true, message: 'Comment added' });
    } catch (error) { next(error); }
};

// ==========================================
// 💼 ZOHO
// ==========================================

exports.getZohoData = async (req, res, next) => {
    try {
        const deals = await ZohoService.getDeals(req.user.id);
        res.status(200).json({ success: true, data: { deals } });
    } catch (error) {
        console.error("Zoho Data Error:", error.message);
        res.status(200).json({ success: true, data: { deals: [] } });
    }
};

exports.createZohoDeal = async (req, res, next) => {
    try {
        const deal = await ZohoService.createDeal(req.user.id, req.body);
        res.status(200).json({ success: true, data: deal });
    } catch (error) { next(error); }
};

exports.createZohoLead = async (req, res, next) => {
    try {
        const lead = await ZohoService.createLead(req.user.id, req.body);
        res.status(200).json({ success: true, data: lead });
    } catch (error) { next(error); }
};

// ==========================================
// 🔌 DISCONNECT / RECONNECT
// ==========================================

exports.disconnectProvider = async (req, res, next) => {
    try {
        const { provider } = req.params;
        const validProviders = ['slack', 'google', 'asana', 'miro', 'jira', 'zoho'];
        if (!validProviders.includes(provider)) {
            return res.status(400).json({ success: false, message: 'Invalid provider' });
        }

        await Connection.deleteByUserIdAndProvider(req.user.id, provider);
        res.status(200).json({ success: true, message: `${provider} disconnected successfully` });
    } catch (error) { next(error); }
};