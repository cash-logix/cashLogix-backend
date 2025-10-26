const express = require('express');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendEmailWithFallback, testGmailConnection, getGmailAccountInfo } = require('../services/emailService');
const { sendSimpleEmail } = require('../services/simpleEmailService');

const router = express.Router();

// ==========================================
// EMAIL VERIFICATION CONFIGURATION
// ==========================================
// Set this to TRUE to auto-verify all new users (bypass email sending)
// Set this to FALSE to require email verification (sends verification emails)
// ==========================================
const AUTO_VERIFY_EMAILS = true;
// ==========================================

// Test Gmail SMTP connection
router.get('/test-email', async (req, res) => {
  try {
    console.log('Testing Gmail SMTP connection...');

    // Test SMTP connection
    const connectionTest = await testGmailConnection();

    // Get account info
    const accountInfo = await getGmailAccountInfo();

    res.json({
      success: true,
      message: 'Gmail SMTP test completed',
      connectionTest,
      accountInfo: accountInfo ? {
        email: accountInfo.email,
        hasPassword: accountInfo.hasPassword
      } : null
    });

  } catch (error) {
    console.error('Gmail SMTP test failed:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Gmail SMTP test failed',
        details: error.message
      }
    });
  }
});

// Email transporter setup (legacy - not used with API)
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    // Add timeout and connection settings for production
    connectionTimeout: 60000, // 60 seconds
    greetingTimeout: 30000,   // 30 seconds
    socketTimeout: 60000,     // 60 seconds
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 20000,         // 20 seconds
    rateLimit: 5,             // 5 emails per rateDelta
    // Retry settings
    retryDelay: 5000,         // 5 seconds between retries
    retryAttempts: 3
  });
};

// Send verification email with multiple fallback methods
const sendVerificationEmail = async (user, token, retryCount = 0) => {
  const maxRetries = 3;

  try {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Cash Logix - تأكيد البريد الإلكتروني',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
          <h2 style="color: #2563eb; text-align: center;">أهلاً وسهلاً بك في Cash Logix!</h2>
          <p>أهلاً ${user.firstName}،</p>
          <p>شكراً ليك إنك سجلت معانا في Cash Logix. عشان نكمل التسجيل، لازم نتأكد من البريد الإلكتروني بتاعك.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">تأكيد البريد الإلكتروني</a>
          </div>
          <p>لو الزر مش شغال، انسخ الرابط ده وافتحه في المتصفح:</p>
          <p style="word-break: break-all; color: #666; background: #f5f5f5; padding: 10px; border-radius: 5px;">${verificationUrl}</p>
          <p>الرابط ده هيبقى صالح لمدة 24 ساعة بس.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px; text-align: center;">لو انت مش اللي عمل الحساب ده، متفتحش البريد ده.</p>
        </div>
      `
    };

    // Try advanced email service first
    try {
      await sendEmailWithFallback(mailOptions);
      console.log(`Verification email sent successfully to ${user.email}`);
      return;
    } catch (advancedError) {
      console.error('Advanced email service failed, trying simple service:', advancedError.message);

      // Try simple email service as fallback
      try {
        await sendSimpleEmail(mailOptions);
        console.log(`Verification email sent successfully via simple service to ${user.email}`);
        return;
      } catch (simpleError) {
        console.error('Simple email service also failed:', simpleError.message);
        throw simpleError;
      }
    }

  } catch (error) {
    console.error(`Email sending failed (attempt ${retryCount + 1}/${maxRetries}):`, error.message);

    if (retryCount < maxRetries - 1) {
      console.log(`Retrying email send in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return sendVerificationEmail(user, token, retryCount + 1);
    } else {
      console.error('Email sending failed after all retries:', error);
      throw error;
    }
  }
};

// Send password reset email with multiple fallback methods
const sendPasswordResetEmail = async (user, token, retryCount = 0) => {
  const maxRetries = 3;

  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Cash Logix - إعادة تعيين كلمة المرور',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
          <h2 style="color: #dc2626; text-align: center;">إعادة تعيين كلمة المرور</h2>
          <p>أهلاً ${user.firstName}،</p>
          <p>انت طلبت إعادة تعيين كلمة المرور لحسابك في Cash Logix. اضغط على الزر ده عشان تعيد تعيين كلمة المرور:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">إعادة تعيين كلمة المرور</a>
          </div>
          <p>لو الزر مش شغال، انسخ الرابط ده وافتحه في المتصفح:</p>
          <p style="word-break: break-all; color: #666; background: #f5f5f5; padding: 10px; border-radius: 5px;">${resetUrl}</p>
          <p>الرابط ده هيبقى صالح لمدة ساعة واحدة بس.</p>
          <p style="background: #fef2f2; padding: 15px; border-radius: 5px; border-right: 4px solid #dc2626;"><strong>لو انت مش اللي طلب إعادة تعيين كلمة المرور، متفتحش البريد ده وكلمة المرور هتفضل زي ما هي.</strong></p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px; text-align: center;">دي رسالة تلقائية من Cash Logix.</p>
        </div>
      `
    };

    // Try advanced email service first
    try {
      await sendEmailWithFallback(mailOptions);
      console.log(`Password reset email sent successfully to ${user.email}`);
      return;
    } catch (advancedError) {
      console.error('Advanced email service failed, trying simple service:', advancedError.message);

      // Try simple email service as fallback
      try {
        await sendSimpleEmail(mailOptions);
        console.log(`Password reset email sent successfully via simple service to ${user.email}`);
        return;
      } catch (simpleError) {
        console.error('Simple email service also failed:', simpleError.message);
        throw simpleError;
      }
    }

  } catch (error) {
    console.error(`Password reset email sending failed (attempt ${retryCount + 1}/${maxRetries}):`, error.message);

    if (retryCount < maxRetries - 1) {
      console.log(`Retrying password reset email send in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return sendPasswordResetEmail(user, token, retryCount + 1);
    } else {
      console.error('Password reset email sending failed after all retries:', error);
      throw error;
    }
  }
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('accountType')
    .isIn(['individual', 'contractor', 'company'])
    .withMessage('Account type must be individual, contractor, or company')
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

    const { firstName, lastName, email, password, accountType, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'User already exists with this email',
          arabic: 'يوجد مستخدم بالفعل بهذا البريد الإلكتروني',
          statusCode: 400
        }
      });
    }

    // Generate email verification token (only if not auto-verifying)
    const emailVerificationToken = AUTO_VERIFY_EMAILS ? null : crypto.randomBytes(32).toString('hex');

    // Set role based on account type
    let role = 'individual_user';
    if (accountType === 'contractor') {
      role = 'individual_user'; // Contractors start as individual users
    } else if (accountType === 'company') {
      role = 'company_owner'; // Company accounts start as company owners
    }

    // Create user with email verification status
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      accountType,
      role,
      phone,
      emailVerificationToken,
      emailVerificationExpires: AUTO_VERIFY_EMAILS ? undefined : Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      isEmailVerified: AUTO_VERIFY_EMAILS // Auto-verify if enabled
    });

    // Send verification email only if auto-verify is disabled
    if (!AUTO_VERIFY_EMAILS) {
      sendVerificationEmail(user, emailVerificationToken).catch(async (emailError) => {
        console.error('Email sending failed (async):', emailError);

        // If email sending fails, auto-verify the user as fallback
        try {
          user.isEmailVerified = true;
          await user.save();
          console.log(`User ${user.email} auto-verified due to email sending failure`);
        } catch (updateError) {
          console.error('Failed to auto-verify user:', updateError);
        }
      });
    }

    // Generate token
    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      message: AUTO_VERIFY_EMAILS
        ? 'User registered successfully. Your email is already verified.'
        : 'User registered successfully. Please check your email to verify your account.',
      arabic: AUTO_VERIFY_EMAILS
        ? 'تم تسجيل المستخدم بنجاح. تم التحقق من بريدك الإلكتروني تلقائياً.'
        : 'تم تسجيل المستخدم بنجاح. يرجى التحقق من بريدك الإلكتروني للتحقق من حسابك.',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          accountType: user.accountType,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          subscription: user.subscription,
          preferences: user.preferences
        },
        token,
        requiresEmailVerification: !AUTO_VERIFY_EMAILS
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error during registration',
        arabic: 'خطأ في الخادم أثناء التسجيل',
        statusCode: 500
      }
    });
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
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

    const { email, password } = req.body;

    // Check for user and include password for comparison
    const user = await User.findByEmail(email).select('+password');
    if (!user) {
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
    if (user.isLocked()) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Account is temporarily locked due to too many failed login attempts',
          arabic: 'الحساب مؤقتاً بسبب محاولات تسجيل دخول فاشلة كثيرة',
          statusCode: 401
        }
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Account is deactivated',
          arabic: 'الحساب معطل',
          statusCode: 401
        }
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Account is blocked',
          arabic: 'الحساب محظور',
          statusCode: 401
        }
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Please verify your email before logging in',
          arabic: 'يرجى التحقق من بريدك الإلكتروني قبل تسجيل الدخول',
          statusCode: 401
        },
        email: user.email // Include email in response for frontend
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Increment login attempts
      await user.incLoginAttempts();

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
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Update last login
    user.lastLogin = new Date();

    // Check if this is first login after verification
    const isFirstLoginAfterVerification = user.firstLoginAfterVerification;
    if (isFirstLoginAfterVerification) {
      user.firstLoginAfterVerification = false;
    }

    await user.save();

    // Generate token
    const token = user.generateAuthToken();

    res.json({
      success: true,
      message: 'Login successful',
      arabic: 'تم تسجيل الدخول بنجاح',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          accountType: user.accountType,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          subscription: user.subscription,
          preferences: user.preferences,
          lastLogin: user.lastLogin
        },
        token,
        isFirstLoginAfterVerification
      }
    });

  } catch (error) {
    console.error('Login error:', error);
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

// @desc    Check email verification status
// @route   GET /api/auth/verify-status
// @access  Public
router.get('/verify-status', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          arabic: 'فشل في التحقق من البيانات',
          details: errors.array(),
          statusCode: 400
        }
      });
    }

    const { email } = req.query;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          arabic: 'المستخدم غير موجود',
          statusCode: 404
        }
      });
    }

    res.json({
      success: true,
      data: {
        isEmailVerified: user.isEmailVerified,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Check verification status error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        statusCode: 500
      }
    });
  }
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('company', 'name industry')
      .populate('partners.user', 'firstName lastName email');

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          accountType: user.accountType,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          subscription: user.subscription,
          preferences: user.preferences,
          company: user.company,
          partners: user.partners,
          avatar: user.avatar,
          bio: user.bio,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        statusCode: 500
      }
    });
  }
});

// @desc    Logout user (client-side token removal)
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', protect, async (req, res) => {
  try {
    // In a more sophisticated setup, you might want to blacklist the token
    // For now, we'll just return success as token removal is handled client-side

    res.json({
      success: true,
      message: 'Logout successful',
      arabic: 'تم تسجيل الخروج بنجاح'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error during logout',
        arabic: 'خطأ في الخادم أثناء تسجيل الخروج',
        statusCode: 500
      }
    });
  }
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Private
router.post('/refresh', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'User not found',
          arabic: 'المستخدم غير موجود',
          statusCode: 401
        }
      });
    }

    // Generate new token
    const token = user.generateAuthToken();

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      arabic: 'تم تحديث الرمز بنجاح',
      data: {
        token
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error during token refresh',
        arabic: 'خطأ في الخادم أثناء تحديث الرمز',
        statusCode: 500
      }
    });
  }
});

// @desc    Verify email with token
// @route   POST /api/auth/verify-email
// @access  Public
router.post('/verify-email', [
  body('token')
    .notEmpty()
    .withMessage('Verification token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          arabic: 'فشل في التحقق من البيانات',
          details: errors.array(),
          statusCode: 400
        }
      });
    }

    const { token } = req.body;

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid or expired verification token',
          arabic: 'رمز التحقق غير صحيح أو منتهي الصلاحية',
          statusCode: 400
        }
      });
    }

    // Verify email
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully',
      arabic: 'تم التحقق من البريد الإلكتروني بنجاح',
      data: {
        user: {
          id: user._id,
          email: user.email,
          isEmailVerified: user.isEmailVerified
        }
      }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error during email verification',
        arabic: 'خطأ في الخادم أثناء التحقق من البريد الإلكتروني',
        statusCode: 500
      }
    });
  }
});

// @desc    Resend email verification
// @route   POST /api/auth/resend-verification
// @access  Public
router.post('/resend-verification', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          arabic: 'فشل في التحقق من البيانات',
          details: errors.array(),
          statusCode: 400
        }
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          arabic: 'المستخدم غير موجود',
          statusCode: 404
        }
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email is already verified',
          arabic: 'البريد الإلكتروني محقق بالفعل',
          statusCode: 400
        }
      });
    }

    // Check rate limiting (3 minutes between emails)
    const now = Date.now();
    const threeMinutes = 3 * 60 * 1000; // 3 minutes in milliseconds

    if (user.lastVerificationEmailSent && (now - user.lastVerificationEmailSent) < threeMinutes) {
      const remainingTime = Math.ceil((threeMinutes - (now - user.lastVerificationEmailSent)) / 1000);
      return res.status(429).json({
        success: false,
        error: {
          message: `Please wait ${remainingTime} seconds before requesting another verification email`,
          arabic: `يرجى الانتظار ${remainingTime} ثانية قبل طلب بريد تحقق آخر`,
          statusCode: 429,
          remainingTime
        }
      });
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = emailVerificationToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    user.lastVerificationEmailSent = now; // Update last sent time
    await user.save();

    // Send verification email asynchronously and handle auto-verification on failure
    sendVerificationEmail(user, emailVerificationToken).catch(async (emailError) => {
      console.error('Resend verification email sending failed (async):', emailError);

      // If email sending fails, auto-verify the user
      try {
        user.isEmailVerified = true;
        await user.save();
        console.log(`User ${user.email} auto-verified due to resend email failure`);
      } catch (updateError) {
        console.error('Failed to auto-verify user during resend:', updateError);
      }
    });

    res.json({
      success: true,
      message: 'Verification email sent successfully',
      arabic: 'تم إرسال بريد التحقق بنجاح'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error during resend verification',
        arabic: 'خطأ في الخادم أثناء إعادة إرسال التحقق',
        statusCode: 500
      }
    });
  }
});

// @desc    Send password reset email
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          arabic: 'فشل في التحقق من البيانات',
          details: errors.array(),
          statusCode: 400
        }
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if email exists or not
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent',
        arabic: 'إذا كان هناك حساب بهذا البريد الإلكتروني، تم إرسال رابط إعادة تعيين كلمة المرور'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    // Send reset email asynchronously (don't wait for it)
    sendPasswordResetEmail(user, resetToken).catch(emailError => {
      console.error('Password reset email sending failed (async):', emailError);
      // Email failure is logged but doesn't affect the response
    });

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent',
      arabic: 'إذا كان هناك حساب بهذا البريد الإلكتروني، تم إرسال رابط إعادة تعيين كلمة المرور'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error during password reset request',
        arabic: 'خطأ في الخادم أثناء طلب إعادة تعيين كلمة المرور',
        statusCode: 500
      }
    });
  }
});

// @desc    Reset password with token
// @route   POST /api/auth/reset-password
// @access  Public
router.post('/reset-password', [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          arabic: 'فشل في التحقق من البيانات',
          details: errors.array(),
          statusCode: 400
        }
      });
    }

    const { token, password } = req.body;

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid or expired reset token',
          arabic: 'رمز إعادة التعيين غير صحيح أو منتهي الصلاحية',
          statusCode: 400
        }
      });
    }

    // Update password and clear reset token
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully',
      arabic: 'تم إعادة تعيين كلمة المرور بنجاح'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error during password reset',
        arabic: 'خطأ في الخادم أثناء إعادة تعيين كلمة المرور',
        statusCode: 500
      }
    });
  }
});

// @desc    Change password (authenticated user)
// @route   POST /api/auth/change-password
// @access  Private
router.post('/change-password', protect, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          arabic: 'فشل في التحقق من البيانات',
          details: errors.array(),
          statusCode: 400
        }
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          arabic: 'المستخدم غير موجود',
          statusCode: 404
        }
      });
    }

    // Check current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Current password is incorrect',
          arabic: 'كلمة المرور الحالية غير صحيحة',
          statusCode: 400
        }
      });
    }

    // Update password
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully',
      arabic: 'تم تغيير كلمة المرور بنجاح'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error during password change',
        arabic: 'خطأ في الخادم أثناء تغيير كلمة المرور',
        statusCode: 500
      }
    });
  }
});

module.exports = router;
