const mysql = require('mysql2/promise');
require('dotenv').config();

const initializeDatabase = async () => {
    try {
        // Connect to MySQL globally (no specific database yet)
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            multipleStatements: true // Crucial: Allows running all queries at once
        });

        console.log('⏳ Connecting to MySQL to initialize gaprioproduction...');

        // Your exact schema, updated for gaprioproduction
        const sqlSchema = `
            -- Create Database
            CREATE DATABASE IF NOT EXISTS gaprioproduction;
            USE gaprioproduction;

            -- 1. USERS TABLE
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(255),
                is_verified BOOLEAN DEFAULT FALSE,
                otp_code VARCHAR(10),
                otp_expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );

            -- 2. MONITORED CHANNELS
            CREATE TABLE IF NOT EXISTS monitored_channels (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                platform VARCHAR(50),
                channel_id VARCHAR(100),
                channel_name VARCHAR(255),
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- 3. REFRESH TOKENS
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                token TEXT NOT NULL,
                user_id INT NOT NULL,
                expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- 4. USER CONNECTIONS
            CREATE TABLE IF NOT EXISTS user_connections (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                provider VARCHAR(50),
                provider_user_id VARCHAR(255),
                access_token TEXT,
                refresh_token TEXT,
                expires_at DATETIME,
                metadata JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- 5. SUGGESTED ACTIONS
            CREATE TABLE IF NOT EXISTS suggested_actions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                source_platform VARCHAR(50),
                source_channel VARCHAR(100),
                source_context TEXT,
                suggested_tool VARCHAR(100),
                suggested_params JSON,
                description TEXT,
                status VARCHAR(50),
                edited_params JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                executed_at DATETIME,
                execution_result JSON,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `;

        // Execute the entire schema
        await connection.query(sqlSchema);
        console.log('✅ Database "gaprioproduction" and all tables are ready!');
        
        // Close the connection
        await connection.end();

    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        process.exit(1);
    }
};

// Allow running this script directly using `npm run db:init`
if (require.main === module) {
    initializeDatabase();
}

module.exports = initializeDatabase;