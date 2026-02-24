// src/controllers/auth.controller.js
const AuthService = require('../services/auth.service');
const TokenService = require('../services/token.service');

exports.register = async (req, res, next) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            const error = new Error('Please provide name, email, and password');
            error.statusCode = 400;
            throw error;
        }

        const user = await AuthService.register(fullName, email, password);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: user
        });
    } catch (error) {
        next(error); // Pass to error middleware
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        console.log(`🔍 DEBUG LOGIN: Email='${email}' Password='${password}'`);

        if (!email || !password) {
            const error = new Error('Please provide email and password');
            error.statusCode = 400;
            throw error;
        }

        const data = await AuthService.login(email, password);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data
        });
    } catch (error) {
        next(error);
    }
};

exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            const error = new Error('Refresh Token is required');
            error.statusCode = 400;
            throw error;
        }

        const data = await AuthService.refresh(refreshToken);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.logout = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        await TokenService.removeRefreshToken(refreshToken);
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        next(error);
    }
};

exports.getMe = async (req, res, next) => {
    try {
        // req.user.id comes from the authMiddleware!
        const user = await AuthService.getProfile(req.user.id);
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};

exports.updateMe = async (req, res, next) => {
    try {
        const updatedUser = await AuthService.updateProfile(req.user.id, req.body);
        res.status(200).json({ success: true, data: updatedUser });
    } catch (error) {
        next(error);
    }
};

exports.updatePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            const error = new Error('Please provide both old and new passwords');
            error.statusCode = 400;
            throw error;
        }

        const result = await AuthService.changePassword(req.user.id, oldPassword, newPassword);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.verifyEmail = async (req, res, next) => {
    try {
        const { email, code } = req.body;
        const data = await AuthService.verifyEmail(email, code);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.resendCode = async (req, res, next) => {
    try {
        const { email } = req.body;
        await AuthService.resendOTP(email);
        res.status(200).json({ success: true, message: 'Code resent' });
    } catch (error) {
        next(error);
    }
};