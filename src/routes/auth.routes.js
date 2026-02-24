const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

// Public Routes (No Token Needed)
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-code', authController.resendCode);

// Protected Routes (Token Required 🔒)
// The 'protect' middleware checks the token before letting the user pass
router.get('/me', protect, authController.getMe);           // Get Profile
router.put('/me', protect, authController.updateMe);        // Update Profile
router.put('/password', protect, authController.updatePassword); // Change Password

module.exports = router;