// src/services/token.service.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

class TokenService {
    // 1. Generate Short-Lived Access Token (15 min)
    static generateAccessToken(user) {
        return jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );
    }

    // 2. Generate Long-Lived Refresh Token (7 Days) & Save to DB
    static async generateRefreshToken(userId) {
        const refreshToken = crypto.randomBytes(40).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

        // Save to DB
        await db.execute(
            'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)',
            [refreshToken, userId, expiresAt]
        );

        return refreshToken;
    }

    // 3. Verify and Rotate Refresh Token
    static async verifyRefreshToken(token) {
        const sql = 'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()';
        const [rows] = await db.execute(sql, [token]);

        if (rows.length === 0) {
            throw new Error('Invalid or Expired Refresh Token');
        }

        return rows[0]; // Returns the token record
    }

    // 4. Revoke Token (Logout)
    static async removeRefreshToken(token) {
        await db.execute('DELETE FROM refresh_tokens WHERE token = ?', [token]);
    }
}

module.exports = TokenService;