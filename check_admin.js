
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function checkAdmin() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', ['admin@gaprio.in']);

        if (rows.length === 0) {
            console.log("❌ User admin@gaprio.in NOT FOUND!");
        } else {
            const user = rows[0];
            console.log("✅ User Found:", {
                id: user.id,
                email: user.email,
                is_verified: user.is_verified, // Should be 1
                otp_code: user.otp_code
            });

            // Check Password
            const isMatch = await bcrypt.compare('Admin@123', user.password_hash);
            console.log("🔐 Password 'Admin@123' Match:", isMatch);

            if (!user.is_verified) {
                console.log("🔄 Force Verifying...");
                await connection.execute('UPDATE users SET is_verified = 1 WHERE id = ?', [user.id]);
                console.log("✅ Verified!");

                // Re-check
                const [newRows] = await connection.execute('SELECT is_verified FROM users WHERE id = ?', [user.id]);
                console.log("🆕 New Status:", newRows[0]);
            }
        }

        await connection.end();

    } catch (error) {
        console.error("❌ Error:", error);
    }
}

checkAdmin();
