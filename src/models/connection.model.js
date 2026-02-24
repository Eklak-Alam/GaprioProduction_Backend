const db = require('../config/db');

class ConnectionModel {
    // 1. Smart Upsert: Only update refresh_token if we got a new one
    static async upsert({ userId, provider, providerUserId, accessToken, refreshToken, expiresAt, metadata }) {

        // Dynamic SQL generation to protect the refresh_token
        let updateFields = [
            "access_token = VALUES(access_token)",
            "expires_at = VALUES(expires_at)",
            "metadata = VALUES(metadata)",
            "updated_at = NOW()"
        ];

        // Only add refresh_token to the UPDATE list if it's NOT null
        if (refreshToken) {
            updateFields.push("refresh_token = VALUES(refresh_token)");
        }

        const sql = `
            INSERT INTO user_connections 
            (user_id, provider, provider_user_id, access_token, refresh_token, expires_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            ${updateFields.join(', ')}
        `;

        const [result] = await db.execute(sql, [
            userId,
            provider,
            providerUserId,
            accessToken,
            refreshToken,
            expiresAt,
            JSON.stringify(metadata)
        ]);

        return result;
    }

    // Find connection by Provider ID (e.g., Google ID)
    static async findByProviderId(provider, providerUserId) {
        const sql = `SELECT * FROM user_connections WHERE provider = ? AND provider_user_id = ?`;
        const [rows] = await db.execute(sql, [provider, providerUserId]);
        return rows[0];
    }

    // Find by User ID
    static async findByUserIdAndProvider(userId, provider) {
        const sql = `SELECT * FROM user_connections WHERE user_id = ? AND provider = ?`;
        const [rows] = await db.execute(sql, [userId, provider]);
        return rows[0];
    }

    // Update Tokens (Used during refresh)
    static async updateTokens(userId, provider, accessToken, refreshToken, expiresAt) {
        let sql, params;

        // Some providers (like Google) might not return a new refresh token every time.
        // If refreshToken is provided, update it. Otherwise, keep the old one.
        if (refreshToken) {
            sql = `UPDATE user_connections SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = NOW() WHERE user_id = ? AND provider = ?`;
            params = [accessToken, refreshToken, expiresAt, userId, provider];
        } else {
            sql = `UPDATE user_connections SET access_token = ?, expires_at = ?, updated_at = NOW() WHERE user_id = ? AND provider = ?`;
            params = [accessToken, expiresAt, userId, provider];
        }
        await db.execute(sql, params);
    }
    // Delete connection (disconnect integration)
    static async deleteByUserIdAndProvider(userId, provider) {
        const sql = `DELETE FROM user_connections WHERE user_id = ? AND provider = ?`;
        const [result] = await db.execute(sql, [userId, provider]);
        return result;
    }
}

module.exports = ConnectionModel;