const axios = require('axios');

// Use env var or default to localhost
const AGENT_URL = process.env.AI_AGENT_URL || 'http://localhost:8000';

exports.chatWithAgent = async (req, res, next) => {
    try {
        const { message } = req.body;
        const userId = req.user.id;

        // 1. Send to Python Agent
        const response = await axios.post(`${AGENT_URL}/ask-agent`, {
            user_id: userId,
            message: message
        });

        // 2. Return response to Frontend
        res.status(200).json(response.data);

    } catch (error) {
        // Handle specific connection error (Python server down)
        if (error.code === 'ECONNREFUSED') {
            console.error("❌ AI Agent Offline");
            return res.status(503).json({
                message: "The AI Brain is currently sleeping. Please start the Python agent.",
                plan: []
            });
        }

        // Pass other errors to global error handler
        next(error);
    }
};

exports.getPendingActions = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const response = await axios.get(`${AGENT_URL}/pending-actions/${userId}`);
        res.status(200).json(response.data);
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            // Return empty list if AI is down so dashboard doesn't crash
            return res.json({ actions: [] });
        }
        next(error);
    }
};

exports.approveAction = async (req, res, next) => {
    try {
        const { actionId } = req.body;
        const userId = req.user.id;

        const response = await axios.post(`${AGENT_URL}/approve-action`, {
            user_id: userId,
            action_id: actionId
        });

        res.status(200).json(response.data);
    } catch (error) {
        next(error);
    }
};

// --- Health Check (Proxy to Python agent) ---
exports.getAgentHealth = async (req, res) => {
    try {
        const response = await axios.get(`${AGENT_URL}/api/health`, { timeout: 5000 });
        res.status(200).json(response.data);
    } catch (err) {
        res.status(503).json({
            status: 'offline',
            agent: false,
            message: 'AI Agent is not reachable',
            timestamp: new Date().toISOString()
        });
    }
};