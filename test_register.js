
require('dotenv').config();
const AuthService = require('./src/services/auth.service');
const db = require('./src/config/db');

async function testRegistration() {
    try {
        console.log("🚀 Testing Registration...");
        const email = `test_${Date.now()}@gaprio.in`;
        const password = 'TestPassword123!';
        const fullName = 'Test User';

        console.log(`📧 Registering: ${email}`);

        const user = await AuthService.register(fullName, email, password);
        console.log("✅ Registration Successful:", user);

    } catch (error) {
        console.error("❌ Registration Failed:", error);
    } finally {
        process.exit();
    }
}

testRegistration();
