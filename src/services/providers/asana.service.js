const axios = require('axios');
const ConnectionModel = require('../../models/connection.model');

class AsanaService {

    // 👇 UPDATE THIS METHOD
    static getAuthURL(userId = null) {
        const baseUrl = 'https://app.asana.com/-/oauth_authorize';
        const params = new URLSearchParams({
            client_id: process.env.ASANA_CLIENT_ID,
            redirect_uri: process.env.ASANA_REDIRECT_URI,
            response_type: 'code',
            scope: 'openid profile email projects:read tasks:read users:read workspaces:read',
        });

        if (userId) {
            params.append('state', userId); // 👈 PASS USER ID HERE
        }

        return `${baseUrl}?${params.toString()}`;
    }

    // --- 2. Get Tokens ---
    static async getTokens(code) {
        try {
            const response = await axios.post(
                'https://app.asana.com/-/oauth_token',
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: process.env.ASANA_CLIENT_ID,
                    client_secret: process.env.ASANA_CLIENT_SECRET,
                    redirect_uri: process.env.ASANA_REDIRECT_URI,
                    code: code,
                })
            );
            return response.data;
        } catch (error) {
            console.error('Asana Token Error:', error.response?.data || error.message);
            throw new Error('Failed to retrieve Asana tokens');
        }
    }

    // --- 3. Get User Info (Manual API Fetch) ---
    static async getUserInfo(accessToken) {
        try {
            // Since we aren't using OpenID scopes, we fetch user info manually via API
            const response = await axios.get('https://app.asana.com/api/1.0/users/me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            const userData = response.data.data;
            
            return {
                id: userData.gid, 
                email: userData.email,
                name: userData.name
            };
        } catch (error) {
            console.error('Asana User Info Error:', error.response?.data || error.message);
            throw new Error('Failed to fetch Asana user info');
        }
    }

    // --- 4. Refresh Token Logic ---
    static async refreshAccessToken(refreshToken) {
        try {
            const response = await axios.post('https://app.asana.com/-/oauth_token', {
                grant_type: 'refresh_token',
                client_id: process.env.ASANA_CLIENT_ID,
                client_secret: process.env.ASANA_CLIENT_SECRET,
                refresh_token: refreshToken
            }, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            return response.data;
        } catch (error) {
            console.error('Asana Refresh Error:', error.response?.data || error.message);
            throw error;
        }
    }

    // --- 5. Get Authenticated Headers (Auto-Refresh) ---
    static async getHeaders(userId) {
        const connection = await ConnectionModel.findByUserIdAndProvider(userId, 'asana');
        if (!connection) throw new Error('Asana not connected');

        const isExpired = Date.now() >= (new Date(connection.expires_at).getTime() - 5 * 60 * 1000);

        if (isExpired && connection.refresh_token) {
            console.log("🔄 Refreshing Asana Access Token...");
            try {
                const tokenData = await this.refreshAccessToken(connection.refresh_token);
                const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

                await ConnectionModel.updateTokens(
                    userId, 'asana', tokenData.access_token, 
                    tokenData.refresh_token || connection.refresh_token, 
                    newExpiresAt
                );
                return { Authorization: `Bearer ${tokenData.access_token}` };
            } catch (error) {
                throw new Error('Asana session expired. Please reconnect.');
            }
        }
        return { Authorization: `Bearer ${connection.access_token}` };
    }

    // --- 6. Features (FIXED: Workspace Pagination) ---

    static async getProjects(userId) {
        try {
            const headers = await this.getHeaders(userId);
            
            // 👇 FIX 2: Fetch Workspace ID First
            // Asana requires a workspace ID to list projects
            const userMe = await axios.get('https://app.asana.com/api/1.0/users/me', { headers });
            const workspaceGid = userMe.data.data.workspaces[0]?.gid;

            if (!workspaceGid) return [];

            const response = await axios.get('https://app.asana.com/api/1.0/projects', { 
                headers,
                params: {
                    workspace: workspaceGid, // Pass the workspace ID here
                    limit: 10,
                    opt_fields: 'name,color,archived',
                    archived: false
                }
            });
            return response.data.data;
        } catch (error) {
            console.error('Asana Projects Error:', error.response?.data || error.message);
            return [];
        }
    }

    static async getTasks(userId) {
        try {
            const headers = await this.getHeaders(userId);
            
            // 👇 FIX 2: Fetch User & Workspace IDs
            const userMe = await axios.get('https://app.asana.com/api/1.0/users/me', { headers });
            const userGid = userMe.data.data.gid;
            const workspaceGid = userMe.data.data.workspaces[0]?.gid;

            if (!workspaceGid) return [];

            const response = await axios.get(
                `https://app.asana.com/api/1.0/tasks`, 
                { 
                    headers,
                    params: {
                        assignee: userGid,
                        workspace: workspaceGid, // Pass workspace ID
                        completed_since: 'now',
                        limit: 15,
                        opt_fields: 'name,due_on,completed,projects.name'
                    }
                }
            );
            return response.data.data;
        } catch (error) {
            console.error('Asana Tasks Error:', error.response?.data || error.message);
            return [];
        }
    }

    static async createTask(userId, { name, notes, date }) {
        const headers = await this.getHeaders(userId);
        const userMe = await axios.get('https://app.asana.com/api/1.0/users/me', { headers });
        
        const response = await axios.post('https://app.asana.com/api/1.0/tasks', {
            data: {
                name,
                notes,
                assignee: userMe.data.data.gid,
                workspace: userMe.data.data.workspaces[0].gid,
                due_on: date
            }
        }, { headers });
        return response.data.data;
    }

    static async completeTask(userId, taskId) {
        const headers = await this.getHeaders(userId);
        await axios.put(`https://app.asana.com/api/1.0/tasks/${taskId}`, {
            data: { completed: true }
        }, { headers });
        return { success: true };
    }
}

module.exports = AsanaService;