const db = require('../config/db');

class MonitoredChannelModel {

    // Add a channel to monitor (upsert — ignore if already exists)
    static async upsert({ userId, platform, channelId, channelName }) {
        const sql = `
            INSERT INTO monitored_channels (user_id, platform, channel_id, channel_name)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                channel_name = VALUES(channel_name),
                is_active = TRUE
        `;
        const [result] = await db.execute(sql, [userId, platform || 'slack', channelId, channelName || '']);
        return result;
    }

    // Bulk add channels (for multi-select)
    static async bulkUpsert(userId, channels) {
        if (!channels.length) return;

        const sql = `
            INSERT INTO monitored_channels (user_id, platform, channel_id, channel_name)
            VALUES ?
            ON DUPLICATE KEY UPDATE 
                channel_name = VALUES(channel_name),
                is_active = TRUE
        `;
        const values = channels.map(c => [userId, c.platform || 'slack', c.channelId, c.channelName || '']);
        await db.query(sql, [values]);
    }

    // Get all monitored channels for a user (optionally by platform)
    static async findByUserId(userId, platform = null) {
        let sql = `SELECT * FROM monitored_channels WHERE user_id = ? AND is_active = TRUE`;
        const params = [userId];

        if (platform) {
            sql += ` AND platform = ?`;
            params.push(platform);
        }

        sql += ` ORDER BY channel_name ASC`;
        const [rows] = await db.execute(sql, params);
        return rows;
    }

    // Check if a specific channel is monitored
    static async isMonitored(userId, channelId) {
        const sql = `SELECT id FROM monitored_channels WHERE user_id = ? AND channel_id = ? AND is_active = TRUE`;
        const [rows] = await db.execute(sql, [userId, channelId]);
        return rows.length > 0;
    }

    // Find which user(s) are monitoring a specific channel
    static async findUsersByChannelId(channelId) {
        const sql = `SELECT user_id FROM monitored_channels WHERE channel_id = ? AND is_active = TRUE`;
        const [rows] = await db.execute(sql, [channelId]);
        return rows.map(r => r.user_id);
    }

    // Remove a specific channel from monitoring
    static async delete(userId, channelId) {
        const sql = `UPDATE monitored_channels SET is_active = FALSE WHERE user_id = ? AND channel_id = ?`;
        await db.execute(sql, [userId, channelId]);
    }

    // Remove by ID
    static async deleteById(id) {
        const sql = `UPDATE monitored_channels SET is_active = FALSE WHERE id = ?`;
        await db.execute(sql, [id]);
    }

    // Replace all monitored channels for a user (set operation)
    static async replaceAll(userId, platform, channels) {
        // Deactivate all existing channels for this platform
        await db.execute(
            `UPDATE monitored_channels SET is_active = FALSE WHERE user_id = ? AND platform = ?`,
            [userId, platform]
        );

        // Insert new selections
        if (channels.length > 0) {
            await this.bulkUpsert(userId, channels.map(c => ({
                ...c,
                platform
            })));
        }
    }
}

module.exports = MonitoredChannelModel;
