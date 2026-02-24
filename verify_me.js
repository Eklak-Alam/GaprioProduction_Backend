const mysql = require('mysql2/promise');
require('dotenv').config();

async function verifyUser() {
    console.log("🔄 Connecting to Database...");
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    const email = 'test@gaprio.in';
    console.log(`🔍 Verifying user: ${email}...`);

    const [result] = await connection.execute(
        'UPDATE users SET is_verified = 1 WHERE email = ?',
        [email]
    );

    if (result.affectedRows > 0) {
        console.log("✅ User verified successfully! You can now login.");
    } else {
        console.log("❌ User not found. Did you register?");
    }

    await connection.end();
}

verifyUser().catch(console.error);
