const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const SubscriptionRequest = require('../models/SubscriptionRequest');
const SubscriptionService = require('../services/subscriptionService');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/subscription-screenshots';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `subscription-${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: fileFilter
});

// @desc    Get subscription plans with pricing
// @route   GET /api/subscription-requests/plans
// @access  Public
router.get('/plans', (req, res) => {
  try {
    const pricing = SubscriptionService.getPlanPricing();
    const durationOptions = SubscriptionService.getDurationOptions();
    
    res.json({
      success: true,
      data: {
        plans: pricing,
        durationOptions,
        paymentNumber: '01204770940'
      }
    });
  } catch (error) {
    console.error('Get plans error:', error);
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

// @desc    Calculate subscription price
// @route   POST /api/subscription-requests/calculate-price
// @access  Public
router.post('/calculate-price', [
  body('plan')
    .isIn(['personal_plus', 'pro', 'company_plan'])
    .withMessage('Invalid plan'),
  body('duration')
    .isInt({ min: 1, max: 12 })
    .withMessage('Duration must be between 1 and 12 months')
], (req, res) => {
  try {
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

    const { plan, duration } = req.body;
    const totalPrice = SubscriptionService.calculatePrice(plan, duration);
    const monthlyPrice = SubscriptionService.getPlanPricing()[plan].price;

    res.json({
      success: true,
      data: {
        monthlyPrice,
        duration,
        totalPrice,
        currency: 'EGP'
      }
    });
  } catch (error) {
    console.error('Calculate price error:', error);
    res.status(400).json({
      success: false,
      error: {
        message: error.message,
        arabic: error.message.includes('Invalid') ? 'خطة غير صالحة' : 'خطأ في حساب السعر',
        statusCode: 400
      }
    });
  }
});

// @desc    Create subscription request
// @route   POST /api/subscription-requests
// @access  Private
router.post('/', protect, upload.single('transactionScreenshot'), [
  body('plan')
    .isIn(['personal_plus', 'pro', 'company_plan'])
    .withMessage('Invalid subscription plan'),
  body('duration')
    .isInt({ min: 1, max: 12 })
    .withMessage('Duration must be between 1 and 12 months'),
  body('paymentMethod')
    .isIn(['vodafone_cash', 'instapay'])
    .withMessage('Invalid payment method'),
  body('paymentInfo.value')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Payment info is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Delete uploaded file if validation fails
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
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

    const { plan, duration, paymentMethod, paymentInfo } = req.body;

    // Calculate total price
    const totalPrice = SubscriptionService.calculatePrice(plan, parseInt(duration));

    // Determine payment info type
    const paymentInfoType = paymentMethod === 'vodafone_cash' ? 'phone' : 'username';

    // Create subscription request
    const subscriptionRequest = await SubscriptionRequest.create({
      user: req.user.id,
      plan,
      duration: parseInt(duration),
      paymentMethod,
      paymentInfo: {
        value: paymentInfo.value.trim(),
        type: paymentInfoType
      },
      transactionScreenshot: req.file ? `/uploads/subscription-screenshots/${req.file.filename}` : null,
      amount: totalPrice,
      status: 'pending'
    });

    // Populate user info
    await subscriptionRequest.populate('user', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Subscription request submitted successfully',
      arabic: 'تم إرسال طلب الاشتراك بنجاح. سيتم مراجعته قريباً',
      data: { subscriptionRequest }
    });
  } catch (error) {
    // Delete uploaded file if error occurs
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Create subscription request error:', error);
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

// @desc    Get user's subscription requests
// @route   GET /api/subscription-requests
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const subscriptionRequests = await SubscriptionRequest.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .populate('user', 'firstName lastName email');

    res.json({
      success: true,
      data: { subscriptionRequests }
    });
  } catch (error) {
    console.error('Get subscription requests error:', error);
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

// @desc    Get single subscription request
// @route   GET /api/subscription-requests/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const subscriptionRequest = await SubscriptionRequest.findById(req.params.id)
      .populate('user', 'firstName lastName email')
      .populate('processedBy', 'firstName lastName email');

    if (!subscriptionRequest) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Subscription request not found',
          arabic: 'طلب الاشتراك غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user owns this request
    if (subscriptionRequest.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized',
          arabic: 'غير مخول',
          statusCode: 403
        }
      });
    }

    res.json({
      success: true,
      data: { subscriptionRequest }
    });
  } catch (error) {
    console.error('Get subscription request error:', error);
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

module.exports = router;

