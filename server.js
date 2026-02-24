const app = require('./src/app'); // Imports the Express App
require('dotenv').config();       // Loads .env variables
const initializeDatabase = require('./src/database/init.db.js'); // Import DB init script

const PORT = process.env.PORT || 5000;

// Wrap in an async function to await the database setup
const startServer = async () => {
    try {
        // 1. Initialize DB and tables first
        await initializeDatabase();

        // 2. Start the server
        app.listen(PORT, () => {
            console.log(`\n=================================`);
            console.log(`🚀 GAPRIO SERVER STARTED`);
            console.log(`📡 URL: http://localhost:${PORT}`);
            console.log(`📅 Mode: ${process.env.NODE_ENV}`);
            console.log(`=================================\n`);
        });
    } catch (error) {
        console.error('❌ Failed to start the server:', error);
        process.exit(1);
    }
};

// Start everything
startServer();