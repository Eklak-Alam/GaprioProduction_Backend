/**
 * Monitoring Controller
 * 
 * Handles CRUD for suggested actions and monitored channels.
 * Also handles webhook receivers for Asana and Google.
 */

const SuggestedActionModel = require('../models/suggestedAction.model');
const MonitoredChannelModel = require('../models/monitoredChannel.model');
const MonitoringService = require('../services/monitoring.service');
const SlackService = require('../services/providers/slack.service');

// ==========================================
// 📋 SUGGESTED ACTIONS
// ==========================================

// GET /api/monitoring/actions — List actions (filterable by status)
exports.getActions = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { status, limit } = req.query;
        const actions = await SuggestedActionModel.findByUserId(userId, status || null, parseInt(limit) || 50);
        res.json({ success: true, data: actions });
    } catch (error) {
        next(error);
    }
};

// GET /api/monitoring/actions/count — Pending count (for badge)
exports.getActionCount = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const count = await SuggestedActionModel.getPendingCount(userId);
        res.json({ success: true, count });
    } catch (error) {
        next(error);
    }
};

// PUT /api/monitoring/actions/:id — Edit action parameters
exports.updateAction = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { params } = req.body;

        const action = await SuggestedActionModel.findById(id);
        if (!action) return res.status(404).json({ success: false, message: 'Action not found' });
        if (action.user_id !== req.user.id) return res.status(403).json({ success: false, message: 'Unauthorized' });

        await SuggestedActionModel.updateParams(id, params);
        res.json({ success: true, message: 'Action parameters updated' });
    } catch (error) {
        next(error);
    }
};

// POST /api/monitoring/actions/:id/execute — Execute after review
exports.executeAction = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        console.log(`⚡ [Monitor] Execute action: id=${id} userId=${userId}`);

        const result = await MonitoringService.executeAction(userId, parseInt(id));
        res.json({ success: true, data: result });
    } catch (error) {
        console.error(`❌ [Monitor] Execute action failed:`, error.message, error.stack);
        next(error);
    }
};

// POST /api/monitoring/actions/:id/reject — Dismiss suggestion
exports.rejectAction = async (req, res, next) => {
    try {
        const { id } = req.params;
        const action = await SuggestedActionModel.findById(id);
        if (!action) return res.status(404).json({ success: false, message: 'Action not found' });
        if (action.user_id !== req.user.id) return res.status(403).json({ success: false, message: 'Unauthorized' });

        await SuggestedActionModel.updateStatus(id, 'rejected');
        res.json({ success: true, message: 'Action dismissed' });
    } catch (error) {
        next(error);
    }
};


// ==========================================
// 📡 MONITORED CHANNELS
// ==========================================

// GET /api/monitoring/channels — Get monitored channels list
exports.getChannels = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { platform } = req.query;
        const channels = await MonitoredChannelModel.findByUserId(userId, platform || null);
        res.json({ success: true, data: channels });
    } catch (error) {
        next(error);
    }
};

// POST /api/monitoring/channels — Add/update channels to monitor (bulk)
exports.setChannels = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { platform, channels } = req.body;
        // channels = [{ channelId, channelName }, ...]

        if (!platform || !Array.isArray(channels)) {
            return res.status(400).json({ success: false, message: 'platform and channels[] are required' });
        }

        // Replace all channels for this platform (set operation)
        await MonitoredChannelModel.replaceAll(userId, platform, channels);

        const updated = await MonitoredChannelModel.findByUserId(userId, platform);
        res.json({ success: true, data: updated, message: `Monitoring ${updated.length} ${platform} channels` });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/monitoring/channels/:id — Stop monitoring a channel
exports.removeChannel = async (req, res, next) => {
    try {
        const { id } = req.params;
        await MonitoredChannelModel.deleteById(id);
        res.json({ success: true, message: 'Channel removed from monitoring' });
    } catch (error) {
        next(error);
    }
};

// GET /api/monitoring/available-channels — Get all Slack channels user has access to
exports.getAvailableChannels = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Fetch all channels from Slack
        const channels = await SlackService.getChannels(userId);

        // Also get currently monitored channels to mark them
        const monitored = await MonitoredChannelModel.findByUserId(userId, 'slack');
        const monitoredIds = new Set(monitored.map(m => m.channel_id));

        const enriched = channels.map(ch => ({
            id: ch.id,
            name: ch.name,
            is_private: ch.is_private || false,
            num_members: ch.num_members || 0,
            topic: ch.topic?.value || '',
            is_monitored: monitoredIds.has(ch.id)
        }));

        res.json({ success: true, data: enriched });
    } catch (error) {
        next(error);
    }
};


// ==========================================
// 🔔 WEBHOOK RECEIVERS (Future: Asana, Google)
// ==========================================

// POST /api/monitoring/webhooks/asana — Asana webhook receiver
exports.asanaWebhook = async (req, res) => {
    // Asana sends a handshake first
    const hookSecret = req.headers['x-hook-secret'];
    if (hookSecret) {
        res.set('X-Hook-Secret', hookSecret);
        return res.sendStatus(200);
    }

    // Process events
    const events = req.body?.events || [];
    for (const event of events) {
        console.log('📥 [Asana Webhook]', event.action, event.resource?.resource_type);
        // TODO: Process Asana events when webhook is configured
    }

    res.sendStatus(200);
};

// POST /api/monitoring/webhooks/google — Google push notification receiver
exports.googleWebhook = async (req, res) => {
    console.log('📥 [Google Webhook]', req.headers['x-goog-resource-state']);
    // TODO: Process Google push notifications when configured
    res.sendStatus(200);
};


// ==========================================
// 🔧 INTERNAL ENDPOINTS (Called by Python agent)
// ==========================================

// GET /api/monitoring/channels/check/:channelId — Check who monitors this channel
exports.checkChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userIds = await MonitoredChannelModel.findUsersByChannelId(channelId);
        res.json({ success: true, user_ids: userIds });
    } catch (error) {
        console.error('❌ checkChannel error:', error.message);
        res.json({ success: false, user_ids: [] });
    }
};

// POST /api/monitoring/internal/analyze — Analyze context and store suggestions
exports.internalAnalyze = async (req, res) => {
    try {
        const { userId, platform, channelId, context, metadata } = req.body;

        if (!userId || !context) {
            return res.status(400).json({ success: false, message: 'userId and context required' });
        }

        // Forward to monitoring service (which calls Python agent)
        const actions = await MonitoringService.processEvent(
            userId, platform || 'slack', channelId || '', context, metadata || {}
        );

        res.json({ success: true, count: actions?.length || 0 });
    } catch (error) {
        console.error('❌ internalAnalyze error:', error.message);
        res.json({ success: false, count: 0 });
    }
};
