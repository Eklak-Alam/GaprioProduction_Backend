const db = require('../config/db');

class SuggestedActionModel {

    // Create a new suggested action
    static async create({ userId, sourcePlatform, sourceChannel, sourceContext, suggestedTool, suggestedParams, description }) {
        const sql = `
            INSERT INTO suggested_actions 
            (user_id, source_platform, source_channel, source_context, suggested_tool, suggested_params, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.execute(sql, [
            userId, sourcePlatform, sourceChannel || '', sourceContext,
            suggestedTool, JSON.stringify(suggestedParams), description
        ]);
        return { id: result.insertId, ...arguments[0], status: 'pending' };
    }

    // Get all actions for a user, optionally filtered by status
    static async findByUserId(userId, status = null, limit = 50) {
        let sql = `SELECT * FROM suggested_actions WHERE user_id = ?`;
        const params = [userId];

        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(limit);

        const [rows] = await db.query(sql, params);
        return rows.map(row => ({
            ...row,
            suggested_params: typeof row.suggested_params === 'string' ? JSON.parse(row.suggested_params) : row.suggested_params,
            edited_params: row.edited_params ? (typeof row.edited_params === 'string' ? JSON.parse(row.edited_params) : row.edited_params) : null,
            execution_result: row.execution_result ? (typeof row.execution_result === 'string' ? JSON.parse(row.execution_result) : row.execution_result) : null,
        }));
    }

    // Find by ID
    static async findById(id) {
        const sql = `SELECT * FROM suggested_actions WHERE id = ?`;
        const [rows] = await db.execute(sql, [id]);
        if (!rows[0]) return null;
        const row = rows[0];
        return {
            ...row,
            suggested_params: typeof row.suggested_params === 'string' ? JSON.parse(row.suggested_params) : row.suggested_params,
            edited_params: row.edited_params ? (typeof row.edited_params === 'string' ? JSON.parse(row.edited_params) : row.edited_params) : null,
            execution_result: row.execution_result ? (typeof row.execution_result === 'string' ? JSON.parse(row.execution_result) : row.execution_result) : null,
        };
    }

    // Update status and optionally store execution result
    static async updateStatus(id, status, executionResult = null) {
        const extra = status === 'executed' ? ', executed_at = NOW()' : '';
        const resultExtra = executionResult ? ', execution_result = ?' : '';
        const sql = `UPDATE suggested_actions SET status = ?${extra}${resultExtra} WHERE id = ?`;
        const params = executionResult ? [status, JSON.stringify(executionResult), id] : [status, id];
        await db.execute(sql, params);
    }

    // Update edited params (user edits before executing)
    static async updateParams(id, editedParams) {
        const sql = `UPDATE suggested_actions SET edited_params = ? WHERE id = ?`;
        await db.execute(sql, [JSON.stringify(editedParams), id]);
    }

    // Get pending count for badge
    static async getPendingCount(userId) {
        const sql = `SELECT COUNT(*) as count FROM suggested_actions WHERE user_id = ? AND status = 'pending'`;
        const [rows] = await db.execute(sql, [userId]);
        return rows[0].count;
    }

    // Batch create multiple actions
    static async createMany(actions) {
        if (!actions.length) return [];

        const sql = `
            INSERT INTO suggested_actions 
            (user_id, source_platform, source_channel, source_context, suggested_tool, suggested_params, description)
            VALUES ?
        `;
        const values = actions.map(a => [
            a.userId, a.sourcePlatform, a.sourceChannel || '', a.sourceContext,
            a.suggestedTool, JSON.stringify(a.suggestedParams), a.description
        ]);

        const [result] = await db.query(sql, [values]);
        return result;
    }

    // Expire old pending actions (cleanup)
    static async expireOld(hoursOld = 24) {
        const sql = `UPDATE suggested_actions SET status = 'expired' WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`;
        await db.execute(sql, [hoursOld]);
    }
}

module.exports = SuggestedActionModel;
