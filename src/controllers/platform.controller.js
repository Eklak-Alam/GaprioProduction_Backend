const GoogleService = require('../services/providers/google.service');
const SlackService = require('../services/providers/slack.service');
const AsanaService = require('../services/providers/asana.service');
const MiroService = require('../services/providers/miro.service');
const JiraService = require('../services/providers/jira.service');
const ZohoService = require('../services/providers/zoho.service');
const ConnectionModel = require('../models/connection.model');
const UserModel = require('../models/user.model');
const TokenService = require('../services/token.service');
const { WebClient } = require('@slack/web-api');
const bcrypt = require('bcryptjs');

// ==========================================
// 🔵 HELPER: Identity Resolution Logic
// ==========================================
async function resolveUser(providerProfile, providerName, stateUserId) {
    
    // 1. LINKING MODE: If stateUserId exists, IT MEANS USER IS ALREADY LOGGED IN.
    // Force link to this ID. Do NOT create a new user.
    if (stateUserId && stateUserId !== 'null' && stateUserId !== 'undefined') {
        console.log(`🔗 Linking ${providerName} account (${providerProfile.email}) to existing User ID: ${stateUserId}`);
        return stateUserId;
    }

    // 2. LOGIN MODE: Check if this connection already exists
    let connection = await ConnectionModel.findByProviderId(providerName, providerProfile.id);
    if (connection) return connection.user_id;

    // 3. REGISTRATION MODE: Check if email exists in users table
    let user = await UserModel.findByEmail(providerProfile.email);
    if (!user) {
        // Create NEW user only if no link and no email match
        console.log(`🆕 Creating NEW user for ${providerProfile.email}`);
        const randomPassword = Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(12);
        const hash = await bcrypt.hash(randomPassword, salt);
        
        return await UserModel.create({
            fullName: providerProfile.name,
            email: providerProfile.email,
            passwordHash: hash
        });
    }
    
    return user.id;
}

// ==========================================
// 🔵 HELPER: Finalize Auth & Redirect (The Missing Function)
// ==========================================
async function finalizeAuth(res, userId, provider, providerUserId, accessToken, refreshToken, expiresAt, metadata = {}) {
    // Upsert connection details
    await ConnectionModel.upsert({
        userId,
        provider,
        providerUserId,
        accessToken,
        refreshToken,
        expiresAt,
        metadata
    });

    // Generate JWT tokens for the user session
    const user = await UserModel.findById(userId);
    const jwtAccess = TokenService.generateAccessToken(user);
    const jwtRefresh = await TokenService.generateRefreshToken(user.id);
    
    // Redirect to frontend with tokens
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/callback?accessToken=${jwtAccess}&refreshToken=${jwtRefresh}`);
}

// ==========================================
// 🟢 GOOGLE
// ==========================================
exports.googleAuth = (req, res) => {
    const { userId } = req.query; // Recieve from Frontend
    const url = GoogleService.getAuthURL(userId); // Pass as state
    res.redirect(url);
};

exports.googleCallback = async (req, res) => {
    try {
        const { code, state } = req.query; // 'state' is the userId
        const tokens = await GoogleService.getTokens(code);
        const googleUser = await GoogleService.getUserInfo(tokens.access_token);

        // Resolve User (Pass state)
        const userId = await resolveUser({
            id: googleUser.id,
            email: googleUser.email,
            name: googleUser.name
        }, 'google', state);

        const expiresAt = new Date(tokens.expiry_date || Date.now() + 3500 * 1000);

        await finalizeAuth(res, userId, 'google', googleUser.id, tokens.access_token, tokens.refresh_token, expiresAt, { picture: googleUser.picture, email: googleUser.email });

    } catch (error) {
        console.error("Google Auth Error:", error);
        res.redirect('http://localhost:3000/login?error=GoogleFailed');
    }
};

// ==========================================
// 🟣 SLACK
// ==========================================
exports.slackAuth = (req, res) => {
    const { userId } = req.query;
    const url = SlackService.getAuthURL(userId);
    res.redirect(url);
};

exports.slackCallback = async (req, res) => {
    try {
        const { code, state } = req.query;
        const data = await SlackService.getTokens(code);
        const tempClient = new WebClient(data.access_token);
        const userInfo = await tempClient.users.info({ user: data.authed_user.id });
        const slackProfile = userInfo.user;

        const userId = await resolveUser({
            id: slackProfile.id,
            email: slackProfile.profile.email,
            name: slackProfile.real_name
        }, 'slack', state);

        await finalizeAuth(res, userId, 'slack', slackProfile.id, data.access_token, null, null, { teamName: data.team.name, teamId: data.team.id });

    } catch (error) {
        console.error("Slack Auth Error:", error);
        res.redirect('http://localhost:3000/login?error=SlackFailed');
    }
};

// ==========================================
// 🟠 ASANA
// ==========================================
exports.asanaAuth = (req, res) => {
    const { userId } = req.query;
    const url = AsanaService.getAuthURL(userId);
    res.redirect(url);
};

exports.asanaCallback = async (req, res) => {
    try {
        const { code, state } = req.query;
        
        // 1. Get Tokens
        const tokens = await AsanaService.getTokens(code);
        
        // 2. Fetch User Info manually using the new Access Token (default scope fix)
        const asanaProfile = await AsanaService.getUserInfo(tokens.access_token);

        // 3. Resolve User
        const userId = await resolveUser({ 
            id: asanaProfile.gid, 
            email: asanaProfile.email, 
            name: asanaProfile.name 
        }, 'asana', state);

        // 4. Save Connection & Finalize
        const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
        
        await finalizeAuth(res, userId, 'asana', asanaProfile.gid, tokens.access_token, tokens.refresh_token, expiresAt, { 
            name: asanaProfile.name, 
            email: asanaProfile.email 
        });

    } catch (error) {
        console.error("Asana Auth Error:", error);
        res.redirect('http://localhost:3000/login?error=AsanaFailed');
    }
};

// ==========================================
// 🎨 MIRO AUTH
// ==========================================
exports.miroAuth = (req, res) => {
    const { userId } = req.query;
    res.redirect(MiroService.getAuthURL(userId));
};

exports.miroCallback = async (req, res) => {
    try {
        const { code, state } = req.query; // state = userId
        const tokens = await MiroService.getTokens(code);
        const miroUser = await MiroService.getUserInfo(tokens.access_token);

        const userId = await resolveUser({
            id: miroUser.id,
            email: miroUser.email, 
            name: miroUser.name
        }, 'miro', state);

        const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)); // expires_in is seconds

        await finalizeAuth(res, userId, 'miro', miroUser.id, tokens.access_token, tokens.refresh_token, expiresAt, { name: miroUser.name, email: miroUser.email });

    } catch (error) {
        console.error("Miro Auth Error:", error);
        res.redirect('http://localhost:3000/login?error=MiroFailed');
    }
};

// ==========================================
// 🐞 JIRA AUTH
// ==========================================
exports.jiraAuth = (req, res) => {
    const { userId } = req.query;
    res.redirect(JiraService.getAuthURL(userId));
};

exports.jiraCallback = async (req, res) => {
    try {
        const { code, state } = req.query; // state = userId
        const tokens = await JiraService.getTokens(code);
        const jiraUser = await JiraService.getUserInfo(tokens.access_token);
        
        // CRITICAL: Fetch Cloud ID (Site ID) to make API calls later
        const siteResource = await JiraService.getCloudId(tokens.access_token);

        const userId = await resolveUser({
            id: jiraUser.account_id,
            email: jiraUser.email,
            name: jiraUser.name
        }, 'jira', state);

        const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

        await finalizeAuth(res, userId, 'jira', jiraUser.account_id, tokens.access_token, tokens.refresh_token, expiresAt, { 
            name: jiraUser.name, 
            email: jiraUser.email, 
            cloudId: siteResource.id, 
            url: siteResource.url 
        });

    } catch (error) {
        console.error("Jira Auth Error:", error);
        res.redirect('http://localhost:3000/login?error=JiraFailed');
    }
};

// ==========================================
// 💼 ZOHO AUTH
// ==========================================
exports.zohoAuth = (req, res) => {
    const { userId } = req.query;
    res.redirect(ZohoService.getAuthURL(userId));
};

exports.zohoCallback = async (req, res) => {
    try {
        const { code, state } = req.query; // state = userId
        
        // 1. Get Tokens (includes api_domain!)
        const tokenData = await ZohoService.getTokens(code);
        const { access_token, refresh_token, api_domain, expires_in } = tokenData;

        // 2. Get User Info using the correct domain
        const profile = await ZohoService.getUserInfo(access_token, api_domain);

        // 3. Link Account
        const userId = await resolveUser({
            id: profile.id,
            email: profile.email,
            name: profile.name
        }, 'zoho', state);

        // 4. Save to DB & Finalize Auth
        const expiresAt = new Date(Date.now() + (expires_in * 1000));
        
        await finalizeAuth(
            res, 
            userId, 
            'zoho', 
            profile.id, 
            access_token, 
            refresh_token, 
            expiresAt, 
            { 
                name: profile.name, 
                // Store the domain we received, or default to .com so subsequent calls work
                apiDomain: api_domain || 'https://www.zohoapis.com' 
            }
        );
        
    } catch (error) {
        console.error("Zoho Auth Error:", error);
        res.redirect('http://localhost:3000/login?error=ZohoFailed');
    }
};