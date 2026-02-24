-- ============================================
-- Monitoring & Suggested Actions Tables
-- Run this against gapriomanagement database
-- ============================================

USE gapriomanagement;

-- 1. MONITORED CHANNELS
-- Stores which channels/sources each user wants to monitor
CREATE TABLE IF NOT EXISTS monitored_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'slack',
    channel_id VARCHAR(255) NOT NULL,
    channel_name VARCHAR(255) DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_channel (user_id, platform, channel_id)
);

-- 2. SUGGESTED ACTIONS
-- Stores AI-predicted actions with lifecycle state
CREATE TABLE IF NOT EXISTS suggested_actions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    source_platform VARCHAR(20) NOT NULL,
    source_channel VARCHAR(255) DEFAULT '',
    source_context TEXT NOT NULL,
    suggested_tool VARCHAR(100) NOT NULL,
    suggested_params JSON NOT NULL,
    description TEXT NOT NULL,
    status ENUM('pending','approved','rejected','executed','expired') DEFAULT 'pending',
    edited_params JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_status (user_id, status),
    INDEX idx_created (created_at)
);
