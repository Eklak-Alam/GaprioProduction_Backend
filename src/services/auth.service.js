// src/services/auth.service.js
const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const TokenService = require('./token.service');
const EmailService = require('./email.service');

class AuthService {

    // 1. Register
    static async register(fullName, email, password) {
        // Validation
        const existingUser = await UserModel.findByEmail(email);
        if (existingUser) {
            const error = new Error('User already exists');
            error.statusCode = 409; // Conflict
            throw error;
        }

        // Hashing
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Creation (Default is_verified = false)
        const userId = await UserModel.create({ fullName, email, passwordHash: hashedPassword });

        // Generate & Send OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await UserModel.saveOTP(userId, otp);
        await EmailService.sendOTP(email, otp);

        return { id: userId, email, isVerified: false };
    }

    // 2. Login 
    static async login(email, password) {
        const user = await UserModel.findByEmail(email);
        console.log(`🔍 SERVICE LOGIN: Email='${email}', UserFound=${!!user}`);
        if (user) console.log(`🔑 Stored Hash: ${user.password_hash.substring(0, 10)}...`);

        const isMatch = user && (await bcrypt.compare(password, user.password_hash));
        console.log(`🔐 PASSWORD MATCH: ${isMatch}`);

        if (!user || !isMatch) {
            const error = new Error('Invalid credentials');
            error.statusCode = 401;
            throw error;
        }

        // --- NEW: Check Verification ---
        /* 
        if (!user.is_verified) {
            // Resend OTP if needed
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            await UserModel.saveOTP(user.id, otp);
            await EmailService.sendOTP(email, otp);

            const error = new Error('Email not verified');
            error.statusCode = 403; // Forbidden until verified
            error.data = { email: user.email, needsVerification: true }; 
            throw error;
        }
        */

        // Generate Tokens
        const accessToken = TokenService.generateAccessToken(user);
        const refreshToken = await TokenService.generateRefreshToken(user.id);

        return {
            user: { id: user.id, name: user.full_name, email: user.email },
            accessToken,
            refreshToken
        };
    }

    // 3. Verify OTP (New Method)
    static async verifyEmail(email, code) {
        const user = await UserModel.findByEmail(email);
        if (!user) throw new Error('User not found');

        if (user.otp_code !== code || new Date() > new Date(user.otp_expires_at)) {
            throw new Error('Invalid or expired code');
        }

        await UserModel.verifyUser(user.id);

        // Auto-login after verification
        const accessToken = TokenService.generateAccessToken(user);
        const refreshToken = await TokenService.generateRefreshToken(user.id);
        return { accessToken, refreshToken, user };
    }

    // 4. Resend OTP (New Method)
    static async resendOTP(email) {
        const user = await UserModel.findByEmail(email);
        if (!user) throw new Error('User not found');

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await UserModel.saveOTP(user.id, otp);
        await EmailService.sendOTP(email, otp);
        return { message: 'OTP sent' };
    }

    // 3. Refresh token
    static async refresh(refreshToken) {
        const tokenRecord = await TokenService.verifyRefreshToken(refreshToken);
        const user = await UserModel.findById(tokenRecord.user_id);

        if (!user) throw new Error('User not found');

        // Generate new Access Token
        const newAccessToken = TokenService.generateAccessToken(user);

        return { accessToken: newAccessToken };
    }

    // 4. Get Profile
    static async getProfile(userId) {
        const user = await UserModel.findById(userId);
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }
        return user;
    }

    // 5. Update Profile
    static async updateProfile(userId, updateData) {
        // Check if user exists
        const user = await UserModel.findById(userId);
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        // Perform update
        await UserModel.update(userId, {
            fullName: updateData.fullName || user.full_name,
            email: updateData.email || user.email
        });

        // Return updated user
        return await UserModel.findById(userId);
    }

    // 6. Change Password
    static async changePassword(userId, oldPassword, newPassword) {
        // Get user WITH password hash
        const user = await UserModel.findByIdWithPassword(userId);
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        // Verify Old Password
        const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
        if (!isMatch) {
            const error = new Error('Incorrect old password');
            error.statusCode = 401;
            throw error;
        }

        // Hash New Password
        const salt = await bcrypt.genSalt(12);
        const newHash = await bcrypt.hash(newPassword, salt);

        // Update DB
        await UserModel.updatePassword(userId, newHash);

        return { message: 'Password updated successfully' };
    }

    // 4. Get Profile (Updated)
    static async getProfile(userId) {
        const user = await UserModel.findById(userId);
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        // Fetch connections
        const connections = await UserModel.getConnections(userId);

        // Return combined data
        return { ...user, connections };
    }
}

module.exports = AuthService;