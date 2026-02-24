
const axios = require('axios');

async function testHttpRegistration() {
    try {
        console.log("🚀 Testing HTTP Registration...");
        const email = `test_http_${Date.now()}@gaprio.in`;
        const password = 'TestPassword123!';
        const fullName = 'Test HTTP User';

        console.log(`📧 Registering via API: ${email}`);

        const response = await axios.post('http://localhost:5000/api/auth/register', {
            fullName,
            email,
            password
        });

        console.log("✅ API Success:", response.data);

    } catch (error) {
        if (error.response) {
            console.error("❌ API Error:", error.response.status, error.response.data);
        } else {
            console.error("❌ Network/Client Error:", error.message);
        }
    }
}

testHttpRegistration();
