/**
 * Monitoring Service
 * 
 * Central orchestrator that receives platform events (Slack messages, Asana updates, etc.)
 * and sends them to the Python agent's /analyze-context endpoint for action prediction.
 * Stores the resulting suggested actions in the database.
 */

const axios = require('axios');
const SuggestedActionModel = require('../models/suggestedAction.model');
const MonitoredChannelModel = require('../models/monitoredChannel.model');

const AGENT_URL = process.env.AI_AGENT_URL || 'http://localhost:8000';

class MonitoringService {

    /**
     * Process a platform event and generate suggested actions.
     * 
     * @param {number} userId - The user to generate actions for
     * @param {string} platform - Source platform: 'slack', 'asana', 'google'
     * @param {string} channelId - Channel/context identifier
     * @param {string} contextText - The message or event text to analyze
     * @param {object} metadata - Additional context (sender, timestamp, etc.)
     */
    static async processEvent(userId, platform, channelId, contextText, metadata = {}) {
        try {
            // Skip very short messages or bot messages
            if (!contextText || contextText.trim().length < 10) return;

            console.log(`🔍 [Monitor] Processing ${platform} event for user ${userId}: "${contextText.substring(0, 80)}..."`);

            // Send to Python agent for analysis
            const response = await axios.post(`${AGENT_URL}/analyze-context`, {
                user_id: userId,
                platform,
                channel_id: channelId,
                context: contextText,
                metadata
            }, { timeout: 30000 });

            const suggestions = response.data.suggestions || [];

            if (suggestions.length === 0) {
                console.log(`💤 [Monitor] No actions suggested. Full response:`, JSON.stringify(response.data));
                return [];
            }

            console.log(`⚡ [Monitor] Agent suggested ${suggestions.length} action(s)`);

            // Store each suggestion in DB
            const created = [];
            for (const suggestion of suggestions) {
                const action = await SuggestedActionModel.create({
                    userId,
                    sourcePlatform: platform,
                    sourceChannel: channelId,
                    sourceContext: contextText.substring(0, 500), // Truncate long contexts
                    suggestedTool: suggestion.tool,
                    suggestedParams: suggestion.params || suggestion.parameters || {},
                    description: suggestion.description || `${suggestion.tool} action`
                });
                created.push(action);
            }

            return created;

        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                console.warn('⚠️ [Monitor] Python agent is offline, skipping analysis');
            } else {
                console.error('❌ [Monitor] Error processing event:', error.message);
            }
            return [];
        }
    }

    /**
     * Execute a suggested action by sending it to the Python agent
     */
    static async executeAction(userId, actionId) {
        const action = await SuggestedActionModel.findById(actionId);
        if (!action) throw new Error('Action not found');
        if (action.user_id !== userId) throw new Error('Unauthorized');

        // Use edited params if available, otherwise original
        const params = action.edited_params || action.suggested_params;

        try {
            const response = await axios.post(`${AGENT_URL}/execute-action`, {
                user_id: userId,
                tool: action.suggested_tool,
                parameters: params
            }, { timeout: 30000 });

            // Mark as executed and store the result (includes URLs, etc.)
            const executionResult = response.data;
            await SuggestedActionModel.updateStatus(actionId, 'executed', executionResult);

            return {
                success: true,
                result: executionResult
            };
        } catch (error) {
            console.error('❌ [Monitor] Failed to execute action:', error.message);
            throw new Error(error.response?.data?.detail || error.message);
        }
    }

    /**
     * Check if a Slack channel is being monitored by any user
     * Returns list of user IDs monitoring this channel
     */
    static async getMonitoringUsers(channelId) {
        return MonitoredChannelModel.findUsersByChannelId(channelId);
    }
}

module.exports = MonitoringService;
