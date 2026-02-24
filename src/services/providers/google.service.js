const { google } = require('googleapis');
const ConnectionModel = require('../../models/connection.model');

class GoogleService {
    
    // --- 1. Auth Configuration ---
    static getOAuthClient() {
        return new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
    }

    static getAuthURL(userId = null) {
        const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
        const options = {
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
            client_id: process.env.GOOGLE_CLIENT_ID,
            access_type: 'offline', // Essential for Refresh Token
            response_type: 'code',
            prompt: 'consent',
            scope: [
                'https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/gmail.modify', // Read, send, draft, delete
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/calendar.events' // Read & Write Events
            ].join(' '),
            state: userId
        };
        return `${rootUrl}?${new URLSearchParams(options).toString()}`;
    }

    static async getTokens(code) {
        const { tokens } = await this.getOAuthClient().getToken(code);
        return tokens;
    }

    static async getUserInfo(accessToken) {
        const auth = this.getOAuthClient();
        auth.setCredentials({ access_token: accessToken });
        const { data } = await google.oauth2({ version: 'v2', auth }).userinfo.get();
        return data;
    }

    // --- 2. The Core Client with Auto-Refresh ---
    static async getAuthenticatedClient(userId) {
        const connection = await ConnectionModel.findByUserIdAndProvider(userId, 'google');
        if (!connection) throw new Error('Google account not connected');

        const oauth2Client = this.getOAuthClient();
        
        oauth2Client.setCredentials({
            access_token: connection.access_token,
            refresh_token: connection.refresh_token,
            expiry_date: new Date(connection.expires_at).getTime()
        });

        // Check if token is expired (or expires in < 5 mins)
        const isExpired = Date.now() >= (new Date(connection.expires_at).getTime() - 5 * 60 * 1000);

        if (isExpired && connection.refresh_token) {
            console.log(`🔄 Refreshing Google Token for User ${userId}...`);
            try {
                // googleapis handles the refresh logic internally if refresh_token is set, 
                // but we explicitly call it to update our DB.
                const { credentials } = await oauth2Client.refreshAccessToken();
                
                const newExpiresAt = new Date(credentials.expiry_date);
                
                await ConnectionModel.updateTokens(
                    userId, 
                    'google', 
                    credentials.access_token, 
                    credentials.refresh_token || connection.refresh_token, // Keep old if not rotated
                    newExpiresAt
                );

                oauth2Client.setCredentials(credentials);
            } catch (err) {
                console.error("Google Refresh Failed:", err);
                throw new Error("Google re-authentication required");
            }
        }

        return oauth2Client;
    }

    // --- 3. Gmail Features ---

    static async getRecentEmails(userId) {
        const auth = await this.getAuthenticatedClient(userId);
        const gmail = google.gmail({ version: 'v1', auth });
        
        const response = await gmail.users.messages.list({ userId: 'me', maxResults: 10, q: 'is:inbox' });
        const messages = response.data.messages || [];

        return Promise.all(messages.map(async (msg) => {
            const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
            const headers = detail.data.payload.headers;
            return { 
                id: msg.id, 
                threadId: msg.threadId,
                subject: headers.find(h => h.name === 'Subject')?.value || '(No Subject)', 
                from: headers.find(h => h.name === 'From')?.value || 'Unknown', 
                snippet: detail.data.snippet,
                date: headers.find(h => h.name === 'Date')?.value
            };
        }));
    }

    static async sendEmail(userId, { to, subject, body }) {
        const auth = await this.getAuthenticatedClient(userId);
        const gmail = google.gmail({ version: 'v1', auth });

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
            `To: ${to}`,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${utf8Subject}`,
            '',
            body
        ];
        const message = messageParts.join('\n');
        const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } });
        return { success: true };
    }

    static async createDraft(userId, { to, subject, body }) {
        const auth = await this.getAuthenticatedClient(userId);
        const gmail = google.gmail({ version: 'v1', auth });

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
            `To: ${to}`,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${utf8Subject}`,
            '',
            body
        ];
        const message = messageParts.join('\n');
        const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const res = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw: encodedMessage } } });
        return { success: true, id: res.data.id };
    }

    // --- 4. Calendar Features ---

    static async getUpcomingMeetings(userId) {
        const auth = await this.getAuthenticatedClient(userId);
        const calendar = google.calendar({ version: 'v3', auth });
        
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date().toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime',
        });
        
        return response.data.items.map(event => ({
            id: event.id,
            summary: event.summary,
            start: event.start,
            end: event.end,
            link: event.hangoutLink || event.htmlLink,
            attendees: event.attendees || []
        }));
    }

    static async createMeeting(userId, { summary, description, startTime, endTime, attendees = [] }) {
        const auth = await this.getAuthenticatedClient(userId);
        const calendar = google.calendar({ version: 'v3', auth });

        const event = {
            summary,
            description,
            start: { dateTime: new Date(startTime).toISOString() },
            end: { dateTime: new Date(endTime).toISOString() },
            attendees: attendees.map(email => ({ email })),
            conferenceData: {
                createRequest: {
                    requestId: Math.random().toString(36).substring(7),
                    conferenceSolutionKey: { type: 'hangoutsMeet' } // Generates GMeet Link
                }
            }
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1
        });

        return {
            id: response.data.id,
            link: response.data.hangoutLink,
            htmlLink: response.data.htmlLink
        };
    }

    // --- 5. Drive Features ---

    static async getRecentFiles(userId) {
        const auth = await this.getAuthenticatedClient(userId);
        const drive = google.drive({ version: 'v3', auth });
        
        const response = await drive.files.list({
            pageSize: 10,
            fields: 'files(id, name, mimeType, webViewLink, iconLink, modifiedTime)',
            orderBy: 'modifiedTime desc'
        });
        
        return response.data.files;
    }
}

module.exports = GoogleService;