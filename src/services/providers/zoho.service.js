const axios = require('axios');
const ConnectionModel = require('../../models/connection.model');

class ZohoService {
    
    // --- 1. Auth URL ---
    static getAuthURL(userId = null) {
        // Uses the URL from your .env file (Default: .com)
        const baseUrl = process.env.ZOHO_AUTH_URL || 'https://accounts.zoho.com/oauth/v2/auth';
        
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: process.env.ZOHO_CLIENT_ID,
            redirect_uri: process.env.ZOHO_REDIRECT_URI,
            access_type: 'offline', 
            prompt: 'consent',
            // Correct Scopes for CRM User & Deals
            scope: 'ZohoCRM.users.READ,ZohoCRM.modules.deals.ALL,ZohoCRM.modules.leads.ALL'
        });

        if (userId) params.append('state', userId);
        
        return `${baseUrl}?${params.toString()}`;
    }

    // --- 2. Get Tokens ---
    static async getTokens(code) {
        try {
            const tokenUrl = process.env.ZOHO_TOKEN_URL || 'https://accounts.zoho.com/oauth/v2/token';
            
            // Send as Form Data (Body)
            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('client_id', process.env.ZOHO_CLIENT_ID);
            params.append('client_secret', process.env.ZOHO_CLIENT_SECRET);
            params.append('redirect_uri', process.env.ZOHO_REDIRECT_URI);
            params.append('code', code);

            const response = await axios.post(tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            
            if (response.data.error) throw new Error(`Zoho Token Error: ${response.data.error}`);
            
            return response.data; 
        } catch (error) {
            console.error("Zoho Token Exchange Failed:", error.response?.data || error.message);
            throw new Error(`Zoho Token Error: ${error.response?.data?.error || error.message}`);
        }
    }

    // --- 3. Get User Info ---
    static async getUserInfo(accessToken, apiDomain) {
        // Fallback to .com if api_domain is missing
        const domain = apiDomain || 'https://www.zohoapis.com';
        
        try {
            const response = await axios.get(`${domain}/crm/v3/users?type=CurrentUser`, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });
            
            if (!response.data.users || response.data.users.length === 0) {
                throw new Error("No user profile found in Zoho response");
            }

            const user = response.data.users[0];
            return { id: user.id, email: user.email, name: user.full_name };
        } catch (error) {
            console.error("Zoho GetUserInfo Failed:", error.response?.data || error.message);
            throw new Error('Failed to fetch Zoho user info');
        }
    }

    // --- 4. Refresh Token ---
    static async refreshAccessToken(refreshToken) {
        try {
            const tokenUrl = process.env.ZOHO_TOKEN_URL || 'https://accounts.zoho.com/oauth/v2/token';

            const params = new URLSearchParams();
            params.append('grant_type', 'refresh_token');
            params.append('client_id', process.env.ZOHO_CLIENT_ID);
            params.append('client_secret', process.env.ZOHO_CLIENT_SECRET);
            params.append('refresh_token', refreshToken);

            const response = await axios.post(tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            
            if (response.data.error) throw new Error(response.data.error);
            return response.data;
        } catch (error) {
            console.error('Zoho Refresh Error:', error.response?.data || error.message);
            throw error;
        }
    }

    // --- 5. Client Builder (Auto-Refresh + Domain Handling) ---
    static async getClient(userId) {
        const connection = await ConnectionModel.findByUserIdAndProvider(userId, 'zoho');
        if (!connection) throw new Error('Zoho not connected');

        let accessToken = connection.access_token;
        const apiDomain = connection.metadata?.apiDomain || 'https://www.zohoapis.com';

        // Check if token expired (1 hour life)
        const isExpired = !connection.expires_at || Date.now() >= (new Date(connection.expires_at).getTime() - 5 * 60 * 1000);
        
        if (isExpired && connection.refresh_token) {
            console.log(`🔄 Refreshing Zoho Token for User ${userId}...`);
            try {
                const tokenData = await this.refreshAccessToken(connection.refresh_token);
                if (tokenData.error) throw new Error(tokenData.error);

                accessToken = tokenData.access_token;
                const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

                await ConnectionModel.updateTokens(
                    userId, 'zoho', accessToken, null, newExpiresAt
                );
            } catch (error) {
                console.error("Zoho refresh failed:", error.message);
                throw new Error('Zoho session expired. Please reconnect.');
            }
        }

        return {
            api: axios.create({ headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }),
            baseUrl: `${apiDomain}/crm/v3`
        };
    }

    // --- 6. Data Features ---

    static async getDeals(userId) {
        try {
            const { api, baseUrl } = await this.getClient(userId);
            const response = await api.get(`${baseUrl}/Deals`, {
                params: { 
                    sort_order: 'desc', 
                    sort_by: 'Created_Time', 
                    per_page: 10, 
                    fields: 'Deal_Name,Amount,Stage,Closing_Date,Probability' 
                }
            });

            if (!response.data.data) return [];

            return response.data.data.map(deal => ({
                id: deal.id,
                name: deal.Deal_Name,
                amount: deal.Amount ? `$${deal.Amount.toLocaleString()}` : 'N/A',
                stage: deal.Stage,
                date: deal.Closing_Date,
                probability: deal.Probability
            }));
        } catch (error) {
            console.error('Zoho Deals Error:', error.response?.data || error.message);
            return [];
        }
    }

    static async createDeal(userId, { dealName, amount, stage }) {
        const { api, baseUrl } = await this.getClient(userId);
        const response = await api.post(`${baseUrl}/Deals`, {
            data: [{
                Deal_Name: dealName,
                Amount: amount,
                Stage: stage || 'Identify Decision Makers',
                Closing_Date: new Date().toISOString().split('T')[0]
            }]
        });
        return response.data;
    }

    static async createLead(userId, { lastName, company, email }) {
        const { api, baseUrl } = await this.getClient(userId);
        const response = await api.post(`${baseUrl}/Leads`, {
            data: [{ Last_Name: lastName, Company: company, Email: email }]
        });
        return response.data;
    }
}

module.exports = ZohoService;