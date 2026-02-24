// src/config/db.js
const mysql = require('mysql2');
require('dotenv').config();

// 1. Create the Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 2. CRITICAL STEP: Convert to Promise Pool
// This enables 'await db.execute()' to work
const promisePool = pool.promise();

// 3. Export the Promise Pool
module.exports = promisePool;