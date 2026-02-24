// src/models/user.model.js
const db = require('../config/db');

class UserModel {
    static async create({ fullName, email, passwordHash }) {
        const sql = `INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)`;
        const [result] = await db.execute(sql, [fullName, email, passwordHash]);
        return result.insertId;
    }

    static async findByEmail(email) {
        const sql = `SELECT * FROM users WHERE email = ?`;
        const [rows] = await db.execute(sql, [email]);
        return rows[0];
    }

    // New: Find user by ID (excludes password for safety)
    static async findById(id) {
        const sql = `SELECT id, full_name, email, created_at, updated_at FROM users WHERE id = ?`;
        const [rows] = await db.execute(sql, [id]);
        return rows[0];
    }

    // New: Find user by ID but INCLUDE password (for password changes)
    static async findByIdWithPassword(id) {
        const sql = `SELECT * FROM users WHERE id = ?`;
        const [rows] = await db.execute(sql, [id]);
        return rows[0];
    }

    // New: Update basic info
    static async update(id, { fullName, email }) {
        const sql = `UPDATE users SET full_name = ?, email = ? WHERE id = ?`;
        const [result] = await db.execute(sql, [fullName, email, id]);
        return result.affectedRows > 0;
    }

    // New: Update Password
    static async updatePassword(id, newPasswordHash) {
        const sql = `UPDATE users SET password_hash = ? WHERE id = ?`;
        const [result] = await db.execute(sql, [newPasswordHash, id]);
        return result.affectedRows > 0;
    }

    // New: Fetch connections (Google, Slack, etc.) for a user
    static async getConnections(userId) {
        const sql = `
            SELECT provider, provider_user_id, metadata, created_at 
            FROM user_connections 
            WHERE user_id = ?
        `;
        const [rows] = await db.execute(sql, [userId]);
        return rows;
    }

    // Add inside UserModel class
    static async saveOTP(userId, otp) {
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
        const sql = `UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE id = ?`;
        await db.execute(sql, [otp, expiresAt, userId]);
    }

    static async verifyUser(userId) {
        const sql = `UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE id = ?`;
        await db.execute(sql, [userId]);
    }

    static async getOTP(userId) {
        const sql = `SELECT otp_code, otp_expires_at FROM users WHERE id = ?`;
        const [rows] = await db.execute(sql, [userId]);
        return rows[0];
    }
}

module.exports = UserModel;