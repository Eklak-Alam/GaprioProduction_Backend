
const axios = require('axios');
require('dotenv').config();

async function createAdmin() {
    try {
        const email = 'admin@gaprio.in';
        const password = 'Admin@123';
        const fullName = 'Admin User';

        console.log(`🚀 Creating User: ${email}`);

        try {
            await axios.post('http://localhost:5000/api/auth/register', {
                fullName,
                email,
                password
            });
            console.log("✅ User Created via API!");
        } catch (e) {
            console.log("⚠️ User might already exist (409) or error:", e.response ? e.response.status : e.message);
        }

        // Verify in DB
        const mysql = require('mysql2/promise');
        const dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME // Make sure .env has DB_NAME=gapriomanagement
        };

        try {
            const connection = await mysql.createConnection({
                ...dbConfig,
                database: 'gapriomanagement'
            });
            console.log("🔄 Verifying User in DB...");
            await connection.execute('UPDATE users SET is_verified = TRUE WHERE email = ?', [email]);
            console.log("✅ User Verified Successfully!");
            await connection.end();
            console.log(`\n🔑 Credentials:\nEmail: ${email}\nPassword: ${password}`);
        } catch (dbError) {
            console.error("❌ DB Error:", dbError.message);
        }


    } catch (error) {
        console.error("❌ Failed:", error.message);
    }
}

createAdmin();
