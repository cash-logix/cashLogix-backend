const express = require('express');
const { body, validationResult } = require('express-validator');
const Supervisor = require('../models/Supervisor');
const jwt = require('jsonwebtoken');

const router = express.Router();

// @desc    Supervisor login
// @route   POST /api/supervisor-auth/login
// @access  Public
router.post('/login', [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          arabic: 'فشل التحقق من البيانات',
          details: errors.array(),
          statusCode: 400
        }
      });
    }

    const { username, password } = req.body;

    // Find supervisor by username and include password for comparison
    const supervisor = await Supervisor.findByUsername(username).select('+password');
    if (!supervisor) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials',
          arabic: 'بيانات اعتماد غير صحيحة',
          statusCode: 401
        }
      });
    }

    // Check if account is locked
    if (supervisor.isLocked()) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Account is temporarily locked due to too many failed login attempts',
          arabic: 'الحساب مؤقتاً بسبب محاولات تسجيل دخول فاشلة كثيرة',
          statusCode: 401
        }
      });
    }

    // Check if supervisor is active
    if (!supervisor.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Supervisor account is deactivated',
          arabic: 'حساب المشرف معطل',
          statusCode: 401
        }
      });
    }

    // Check password
    const isPasswordValid = await supervisor.comparePassword(password);
    if (!isPasswordValid) {
      // Increment login attempts
      await supervisor.incLoginAttempts();

      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials',
          arabic: 'بيانات اعتماد غير صحيحة',
          statusCode: 401
        }
      });
    }

    // Reset login attempts on successful login
    if (supervisor.loginAttempts > 0) {
      await supervisor.resetLoginAttempts();
    }

    // Update last login
    supervisor.lastLogin = new Date();
    await supervisor.save();

    // Generate token with supervisor info
    const token = jwt.sign(
      {
        id: supervisor._id,
        supervisorId: supervisor._id,
        userId: supervisor.user,
        username: supervisor.username,
        role: 'supervisor'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    // Populate user info
    await supervisor.populate('user', 'firstName lastName email');

    res.json({
      success: true,
      message: 'Login successful',
      arabic: 'تم تسجيل الدخول بنجاح',
      data: {
        supervisor: {
          id: supervisor._id,
          username: supervisor.username,
          name: supervisor.name,
          user: {
            id: supervisor.user._id,
            name: `${supervisor.user.firstName} ${supervisor.user.lastName}`,
            email: supervisor.user.email
          }
        },
        token
      }
    });
  } catch (error) {
    console.error('Supervisor login error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error during login',
        arabic: 'خطأ في الخادم أثناء تسجيل الدخول',
        statusCode: 500
      }
    });
  }
});

module.exports = router;

