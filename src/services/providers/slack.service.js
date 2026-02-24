const { WebClient } = require('@slack/web-api');
const axios = require('axios');
const ConnectionModel = require('../../models/connection.model');

class SlackService {

    // 1. Auth URL — with full scopes for the complete Slack experience
    static getAuthURL(userId = null) {
        const scopes = [
            'channels:read', 'groups:read', 'chat:write', 'chat:write.customize', 'users:read',
            'channels:history', 'groups:history',
            'channels:join',
            'im:read', 'im:history',
            'mpim:read', 'mpim:history',
            'reactions:write', 'reactions:read',
            'users.profile:read'
        ];
        const userScopes = ['openid', 'email', 'profile'];

        const url = new URL('https://slack.com/oauth/v2/authorize');
        url.searchParams.append('client_id', process.env.SLACK_CLIENT_ID);
        url.searchParams.append('scope', scopes.join(','));
        url.searchParams.append('user_scope', userScopes.join(','));
        url.searchParams.append('redirect_uri', process.env.SLACK_REDIRECT_URI);

        if (userId) {
            url.searchParams.append('state', userId);
        }

        return url.toString();
    }

    // 2. Exchange Code for Token
    static async getTokens(code) {
        const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
            params: {
                client_id: process.env.SLACK_CLIENT_ID,
                client_secret: process.env.SLACK_CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.SLACK_REDIRECT_URI
            }
        });

        if (!response.data.ok) {
            console.error("Slack Token Error:", response.data);
            throw new Error(`Slack Auth Failed: ${response.data.error}`);
        }

        return response.data;
    }

    // 3. Refresh Token Helper
    static async refreshAccessToken(refreshToken) {
        try {
            const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
                params: {
                    client_id: process.env.SLACK_CLIENT_ID,
                    client_secret: process.env.SLACK_CLIENT_SECRET,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                }
            });

            if (!response.data.ok) throw new Error(response.data.error);
            return response.data;
        } catch (error) {
            console.error('Slack Refresh Error:', error.message);
            throw error;
        }
    }

    // 4. Get Client (With Auto-Refresh)
    static async getClient(userId) {
        const connection = await ConnectionModel.findByUserIdAndProvider(userId, 'slack');
        if (!connection) throw new Error('Slack not connected');

        if (connection.refresh_token && connection.expires_at && new Date() > new Date(connection.expires_at)) {
            console.log("🔄 Refreshing Slack Token...");
            try {
                const data = await this.refreshAccessToken(connection.refresh_token);
                const newExpiresAt = new Date(Date.now() + (data.expires_in * 1000));

                await ConnectionModel.updateTokens(
                    userId,
                    'slack',
                    data.access_token,
                    data.refresh_token,
                    newExpiresAt
                );

                return new WebClient(data.access_token);
            } catch (error) {
                console.error("Slack refresh failed:", error.message);
            }
        }

        return new WebClient(connection.access_token);
    }

    // ========================================
    // CHANNELS
    // ========================================

    static async getChannels(userId) {
        try {
            const client = await this.getClient(userId);
            const result = await client.conversations.list({
                limit: 200,
                types: 'public_channel,private_channel',
                exclude_archived: true
            });

            return result.channels.map(c => ({
                id: c.id,
                name: c.name,
                topic: c.topic?.value || '',
                purpose: c.purpose?.value || '',
                members_count: c.num_members,
                is_private: c.is_private,
                is_member: c.is_member
            }));
        } catch (error) {
            console.error("Slack API Error (getChannels):", error.data?.error || error.message);
            return [];
        }
    }

    // ========================================
    // DMs (Direct Messages)
    // ========================================

    static async getDMs(userId) {
        try {
            const client = await this.getClient(userId);

            // Get IM conversations
            const result = await client.conversations.list({
                limit: 100,
                types: 'im,mpim',
                exclude_archived: true
            });

            // Enrich with user info
            const dms = [];
            for (const conv of result.channels || []) {
                if (conv.is_im && conv.user) {
                    try {
                        const userInfo = await client.users.info({ user: conv.user });
                        dms.push({
                            id: conv.id,
                            userId: conv.user,
                            name: userInfo.user?.real_name || userInfo.user?.name || 'Unknown',
                            displayName: userInfo.user?.profile?.display_name || userInfo.user?.real_name || 'Unknown',
                            avatar: userInfo.user?.profile?.image_72 || '',
                            isOnline: userInfo.user?.presence === 'active'
                        });
                    } catch (e) {
                        dms.push({
                            id: conv.id,
                            userId: conv.user,
                            name: 'Unknown User',
                            displayName: 'Unknown User',
                            avatar: '',
                            isOnline: false
                        });
                    }
                } else if (conv.is_mpim) {
                    dms.push({
                        id: conv.id,
                        userId: null,
                        name: conv.name || 'Group DM',
                        displayName: conv.purpose?.value || conv.name || 'Group DM',
                        avatar: '',
                        isOnline: false,
                        isGroup: true
                    });
                }
            }
            return dms;
        } catch (error) {
            console.error("Slack API Error (getDMs):", error.data?.error || error.message);
            return [];
        }
    }

    // ========================================
    // MESSAGE HISTORY
    // ========================================

    static async getMessageHistory(userId, channelId, limit = 50) {
        try {
            const client = await this.getClient(userId);

            // Auto-join the channel if the bot isn't a member yet
            try {
                await client.conversations.join({ channel: channelId });
            } catch (joinErr) {
                // Ignore errors (already in channel, or it's a DM/private channel we can't join)
            }

            const result = await client.conversations.history({
                channel: channelId,
                limit: limit
            });

            // Build a user cache to avoid repeated API calls
            const userCache = {};
            const messages = [];

            for (const msg of (result.messages || []).reverse()) {
                // Skip subtypes like channel_join, channel_leave unless they have text
                if (msg.subtype && !['bot_message'].includes(msg.subtype) && !msg.text) continue;

                let senderName = 'Unknown';
                let senderAvatar = '';

                if (msg.user) {
                    if (!userCache[msg.user]) {
                        try {
                            const info = await client.users.info({ user: msg.user });
                            userCache[msg.user] = {
                                name: info.user?.real_name || info.user?.name || 'Unknown',
                                avatar: info.user?.profile?.image_72 || ''
                            };
                        } catch (e) {
                            userCache[msg.user] = { name: 'Unknown', avatar: '' };
                        }
                    }
                    senderName = userCache[msg.user].name;
                    senderAvatar = userCache[msg.user].avatar;
                } else if (msg.bot_id || msg.subtype === 'bot_message') {
                    senderName = msg.username || 'Bot';
                    senderAvatar = msg.icons?.image_72 || '';
                }

                messages.push({
                    ts: msg.ts,
                    text: msg.text || '',
                    user: msg.user || msg.bot_id || '',
                    senderName,
                    senderAvatar,
                    threadTs: msg.thread_ts || null,
                    replyCount: msg.reply_count || 0,
                    reactions: (msg.reactions || []).map(r => ({
                        name: r.name,
                        count: r.count,
                        users: r.users || []
                    })),
                    files: (msg.files || []).map(f => ({
                        name: f.name,
                        type: f.mimetype,
                        url: f.url_private,
                        thumb: f.thumb_360 || f.thumb_80 || null
                    })),
                    isBot: !!msg.bot_id || msg.subtype === 'bot_message'
                });
            }

            return { messages, hasMore: result.has_more || false };
        } catch (error) {
            console.error("Slack API Error (getMessageHistory):", error.data?.error || error.message);
            return { messages: [], hasMore: false };
        }
    }

    // ========================================
    // THREAD REPLIES
    // ========================================

    static async getThreadReplies(userId, channelId, threadTs) {
        try {
            const client = await this.getClient(userId);
            const result = await client.conversations.replies({
                channel: channelId,
                ts: threadTs,
                limit: 100
            });

            const userCache = {};
            const messages = [];

            for (const msg of result.messages || []) {
                let senderName = 'Unknown';
                let senderAvatar = '';

                if (msg.user) {
                    if (!userCache[msg.user]) {
                        try {
                            const info = await client.users.info({ user: msg.user });
                            userCache[msg.user] = {
                                name: info.user?.real_name || info.user?.name || 'Unknown',
                                avatar: info.user?.profile?.image_72 || ''
                            };
                        } catch (e) {
                            userCache[msg.user] = { name: 'Unknown', avatar: '' };
                        }
                    }
                    senderName = userCache[msg.user].name;
                    senderAvatar = userCache[msg.user].avatar;
                }

                messages.push({
                    ts: msg.ts,
                    text: msg.text || '',
                    user: msg.user || '',
                    senderName,
                    senderAvatar,
                    reactions: (msg.reactions || []).map(r => ({ name: r.name, count: r.count })),
                    isParent: msg.ts === threadTs
                });
            }

            return messages;
        } catch (error) {
            console.error("Slack API Error (getThreadReplies):", error.data?.error || error.message);
            return [];
        }
    }

    // ========================================
    // WORKSPACE USERS (for sidebar presence)
    // ========================================

    static async getWorkspaceUsers(userId) {
        try {
            const client = await this.getClient(userId);
            const result = await client.users.list({ limit: 200 });

            // Get the bot's own user ID so we can identify it
            let botUserId = null;
            try {
                const authTest = await client.auth.test();
                botUserId = authTest.user_id;
            } catch (e) { /* ignore */ }

            const users = (result.members || [])
                .filter(u => !u.deleted && u.id !== 'USLACKBOT')
                .filter(u => !u.is_bot || u.id === botUserId)
                .map(u => ({
                    id: u.id,
                    name: u.real_name || u.name,
                    displayName: u.profile?.display_name || u.real_name || u.name,
                    avatar: u.profile?.image_72 || '',
                    isOnline: u.presence === 'active',
                    title: u.profile?.title || '',
                    isBot: u.is_bot || false
                }));

            // If the bot wasn't found via auth.test, add a synthetic Gaprio Agent entry
            if (botUserId && !users.find(u => u.id === botUserId)) {
                users.unshift({
                    id: botUserId,
                    name: 'Gaprio Agent',
                    displayName: 'Gaprio Agent',
                    avatar: '',
                    isOnline: true,
                    title: 'AI Assistant',
                    isBot: true
                });
            }

            return users;
        } catch (error) {
            console.error("Slack API Error (getWorkspaceUsers):", error.data?.error || error.message);
            return [];
        }
    }

    // ========================================
    // SEND MESSAGE
    // ========================================

    static async sendMessage(userId, { channelId, text, threadTs, username, iconUrl }) {
        try {
            const client = await this.getClient(userId);
            const params = { channel: channelId, text };
            if (threadTs) params.thread_ts = threadTs;

            // Customize sender identity (requires chat:write.customize scope)
            if (username) {
                params.username = username;
                if (iconUrl) params.icon_url = iconUrl;
            }

            const result = await client.chat.postMessage(params);
            return { success: true, ts: result.ts };
        } catch (error) {
            throw new Error(`Failed to send Slack message: ${error.data?.error || error.message}`);
        }
    }

    // ========================================
    // REACTIONS
    // ========================================

    static async addReaction(userId, { channelId, timestamp, emoji }) {
        try {
            const client = await this.getClient(userId);
            await client.reactions.add({
                channel: channelId,
                timestamp: timestamp,
                name: emoji
            });
            return { success: true };
        } catch (error) {
            throw new Error(`Failed to add reaction: ${error.data?.error || error.message}`);
        }
    }
}

module.exports = SlackService;