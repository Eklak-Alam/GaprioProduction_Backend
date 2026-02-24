const axios = require('axios');
const ConnectionModel = require('../../models/connection.model');

class JiraService {
    
    // --- 1. Auth ---
    static getAuthURL(userId = null) {
        const baseUrl = 'https://auth.atlassian.com/authorize';
        const params = new URLSearchParams({
            audience: 'api.atlassian.com',
            client_id: process.env.JIRA_CLIENT_ID,
            // Added offline_access for refresh tokens
            scope: 'read:jira-work manage:jira-project read:jira-user write:jira-work read:me read:account offline_access', 
            redirect_uri: process.env.JIRA_REDIRECT_URI,
            state: userId,
            response_type: 'code',
            prompt: 'consent'
        });
        return `${baseUrl}?${params.toString()}`;
    }

    static async getTokens(code) {
        try {
            const response = await axios.post('https://auth.atlassian.com/oauth/token', {
                grant_type: 'authorization_code',
                client_id: process.env.JIRA_CLIENT_ID,
                client_secret: process.env.JIRA_CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.JIRA_REDIRECT_URI,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Jira Token Error: ${error.response?.data?.error_description || error.message}`);
        }
    }

    static async getUserInfo(accessToken) {
        const response = await axios.get('https://api.atlassian.com/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return response.data; 
    }

    static async getCloudId(accessToken) {
        const response = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (response.data.length > 0) return response.data[0]; 
        throw new Error('No Jira resources found');
    }

    // --- 2. Auto-Refresh Helper ---
    static async refreshAccessToken(refreshToken) {
        try {
            const response = await axios.post('https://auth.atlassian.com/oauth/token', {
                grant_type: 'refresh_token',
                client_id: process.env.JIRA_CLIENT_ID,
                client_secret: process.env.JIRA_CLIENT_SECRET,
                refresh_token: refreshToken
            });
            return response.data;
        } catch (error) {
            console.error('Jira Refresh Error:', error.response?.data || error.message);
            throw error;
        }
    }

    // --- 3. Authenticated Client Builder ---
    static async getClient(userId) {
        const connection = await ConnectionModel.findByUserIdAndProvider(userId, 'jira');
        if (!connection) throw new Error('Jira not connected');

        let accessToken = connection.access_token;
        
        // Refresh Logic
        const isExpired = Date.now() >= (new Date(connection.expires_at).getTime() - 5 * 60 * 1000);
        if (isExpired && connection.refresh_token) {
            console.log(`🔄 Refreshing Jira Token for User ${userId}...`);
            try {
                const tokenData = await this.refreshAccessToken(connection.refresh_token);
                accessToken = tokenData.access_token;
                const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

                await ConnectionModel.updateTokens(
                    userId, 'jira', accessToken, tokenData.refresh_token, newExpiresAt
                );
            } catch (error) {
                throw new Error('Jira session expired. Please reconnect.');
            }
        }

        // Get Cloud ID
        const cloudId = connection.metadata?.cloudId;
        if (!cloudId) throw new Error('Jira Cloud ID missing');

        return { 
            api: axios.create({ headers: { Authorization: `Bearer ${accessToken}` } }),
            cloudId,
            // UPDATED: Using the new standard base URL
            baseUrl: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`
        };
    }

    // --- 4. Features ---

    static async getIssues(userId) {
        const { api, baseUrl } = await this.getClient(userId);
        try {
            const jql = 'assignee = currentUser() ORDER BY updated DESC';
            
            // 👇 FIX: Use POST on /search/jql endpoint
            const response = await api.post(`${baseUrl}/search/jql`, {
                jql: jql,
                maxResults: 10,
                fields: ['summary', 'status', 'priority', 'created']
            });

            return response.data.issues.map(issue => ({
                id: issue.id,
                key: issue.key,
                summary: issue.fields.summary,
                status: issue.fields.status.name,
                priority: issue.fields.priority?.name || 'Medium'
            }));
        } catch (error) {
            console.error('Jira Issues Error:', error.response?.data || error.message);
            return [];
        }
    }

    static async createIssue(userId, { summary, description, projectKey, issueType = 'Task' }) {
        const { api, baseUrl } = await this.getClient(userId);
        
        const body = {
            fields: {
                project: { key: projectKey },
                summary: summary,
                issuetype: { name: issueType },
                description: {
                    type: "doc",
                    version: 1,
                    content: [{ type: "paragraph", content: [{ type: "text", text: description || "" }] }]
                }
            }
        };

        const response = await api.post(`${baseUrl}/issue`, body);
        return response.data;
    }
}

module.exports = JiraService;