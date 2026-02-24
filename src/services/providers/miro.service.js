const axios = require('axios');
const ConnectionModel = require('../../models/connection.model');

class MiroService {
    
    // --- 1. Auth ---
    static getAuthURL(userId = null) {
        const baseUrl = 'https://miro.com/oauth/authorize';
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: process.env.MIRO_CLIENT_ID,
            redirect_uri: process.env.MIRO_REDIRECT_URI,
            scope: 'boards:read boards:write identity:read identity:write team:read team:write'
        });
        if (userId) params.append('state', userId);
        return `${baseUrl}?${params.toString()}`;
    }

    static async getTokens(code) {
        try {
            const response = await axios.post('https://api.miro.com/v1/oauth/token', new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: process.env.MIRO_CLIENT_ID,
                client_secret: process.env.MIRO_CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.MIRO_REDIRECT_URI,
            }));
            return response.data;
        } catch (error) {
            throw new Error(`Miro Token Error: ${error.response?.data?.message || error.message}`);
        }
    }

    static async getUserInfo(accessToken) {
        const response = await axios.get('https://api.miro.com/v1/users/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return response.data; 
    }

    static async refreshAccessToken(refreshToken) {
        const response = await axios.post('https://api.miro.com/v1/oauth/token', new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: process.env.MIRO_CLIENT_ID,
            client_secret: process.env.MIRO_CLIENT_SECRET,
            refresh_token: refreshToken
        }));
        return response.data;
    }

    static async getClient(userId) {
        const connection = await ConnectionModel.findByUserIdAndProvider(userId, 'miro');
        if (!connection) throw new Error('Miro not connected');

        let accessToken = connection.access_token;
        const isExpired = Date.now() >= (new Date(connection.expires_at).getTime() - 5 * 60 * 1000);

        if (isExpired && connection.refresh_token) {
            console.log(`🔄 Refreshing Miro Token for User ${userId}...`);
            try {
                const tokenData = await this.refreshAccessToken(connection.refresh_token);
                accessToken = tokenData.access_token;
                const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

                await ConnectionModel.updateTokens(
                    userId, 'miro', accessToken, tokenData.refresh_token, newExpiresAt
                );
            } catch (error) {
                throw new Error('Miro session expired. Please reconnect.');
            }
        }
        return axios.create({ headers: { Authorization: `Bearer ${accessToken}` } });
    }

    // --- 2. Features ---

    static async getBoards(userId) {
        try {
            const client = await this.getClient(userId);
            const response = await client.get('https://api.miro.com/v2/boards?limit=10&sort=last_modified');
            
            return response.data.data.map(board => ({
                id: board.id,
                name: board.name,
                url: board.viewLink,
                updatedAt: board.modifiedAt,
                thumbnail: board.picture?.imageUrl || null
            }));
        } catch (error) {
            console.error('Miro Boards Error:', error.response?.data || error.message);
            return [];
        }
    }

    static async createBoard(userId, { name, description }) {
        const client = await this.getClient(userId);
        const response = await client.post('https://api.miro.com/v2/boards', {
            name: name || 'Gaprio Board',
            description: description || 'Created via Gaprio'
        });
        return { id: response.data.id, viewLink: response.data.viewLink };
    }
}

module.exports = MiroService;