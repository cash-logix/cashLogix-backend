const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const SubscriptionRequest = require('../models/SubscriptionRequest');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// @desc    Admin login
// @route   POST /api/admin/login
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

    // Check if user is admin
    const userIsAdmin = user.accountType === 'admin' || user.role === 'admin';
    if (!userIsAdmin) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Admin access required',
          arabic: 'يتطلب الوصول كمسؤول',
          statusCode: 403
        }
      });
    }

    // Check if account is locked
    if (user.isLocked()) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Account is temporarily locked',
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

    // Check password (skip email verification for admin)
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
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
    await user.save();

    // Generate token
    const token = user.generateAuthToken();

    res.json({
      success: true,
      message: 'Admin login successful',
      arabic: 'تم تسجيل الدخول بنجاح',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          accountType: user.accountType,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
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

// @desc    Get all subscription requests
// @route   GET /api/admin/subscription-requests
// @access  Private (Admin only)
router.get('/subscription-requests', protect, isAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && ['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [requests, total] = await Promise.all([
      SubscriptionRequest.find(query)
        .populate('user', 'firstName lastName email phone')
        .populate('processedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SubscriptionRequest.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
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
// @route   GET /api/admin/subscription-requests/:id
// @access  Private (Admin only)
router.get('/subscription-requests/:id', protect, isAdmin, async (req, res) => {
  try {
    const request = await SubscriptionRequest.findById(req.params.id)
      .populate('user', 'firstName lastName email phone accountType')
      .populate('processedBy', 'firstName lastName email');

    if (!request) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Subscription request not found',
          arabic: 'طلب الاشتراك غير موجود',
          statusCode: 404
        }
      });
    }

    res.json({
      success: true,
      data: { request }
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

// @desc    Approve subscription request
// @route   PUT /api/admin/subscription-requests/:id/approve
// @access  Private (Admin only)
router.put('/subscription-requests/:id/approve', protect, isAdmin, [
  body('adminNotes').optional().trim()
], async (req, res) => {
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

    const request = await SubscriptionRequest.findById(req.params.id)
      .populate('user');

    if (!request) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Subscription request not found',
          arabic: 'طلب الاشتراك غير موجود',
          statusCode: 404
        }
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Request is not pending',
          arabic: 'الطلب غير قيد المراجعة',
          statusCode: 400
        }
      });
    }

    // Approve the request
    await request.approve(req.user.id, req.body.adminNotes);

    // Update user's subscription
    const user = await User.findById(request.user._id);
    if (user) {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + request.duration);

      user.subscription.plan = request.plan;
      user.subscription.status = 'active';
      user.subscription.startDate = startDate;
      user.subscription.endDate = endDate;
      user.subscription.paymentMethod = request.paymentMethod;
      await user.save();
    }

    // Repopulate after approval
    await request.populate('user', 'firstName lastName email');
    await request.populate('processedBy', 'firstName lastName email');

    res.json({
      success: true,
      message: 'Subscription request approved successfully',
      arabic: 'تم الموافقة على طلب الاشتراك بنجاح',
      data: { request }
    });
  } catch (error) {
    console.error('Approve subscription request error:', error);
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

// @desc    Reject subscription request
// @route   PUT /api/admin/subscription-requests/:id/reject
// @access  Private (Admin only)
router.put('/subscription-requests/:id/reject', protect, isAdmin, [
  body('adminNotes').optional().trim()
], async (req, res) => {
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

    const request = await SubscriptionRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Subscription request not found',
          arabic: 'طلب الاشتراك غير موجود',
          statusCode: 404
        }
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Request is not pending',
          arabic: 'الطلب غير قيد المراجعة',
          statusCode: 400
        }
      });
    }

    // Reject the request
    await request.reject(req.user.id, req.body.adminNotes);

    // Repopulate after rejection
    await request.populate('user', 'firstName lastName email');
    await request.populate('processedBy', 'firstName lastName email');

    res.json({
      success: true,
      message: 'Subscription request rejected',
      arabic: 'تم رفض طلب الاشتراك',
      data: { request }
    });
  } catch (error) {
    console.error('Reject subscription request error:', error);
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

// @desc    Get admin dashboard analytics
// @route   GET /api/admin/analytics
// @access  Private (Admin only)
router.get('/analytics', protect, isAdmin, async (req, res) => {
  try {
    const Expense = require('../models/Expense');
    const Revenue = require('../models/Revenue');

    // Get subscription request statistics
    const [totalRequests, pendingRequests, approvedRequests, rejectedRequests] = await Promise.all([
      SubscriptionRequest.countDocuments(),
      SubscriptionRequest.countDocuments({ status: 'pending' }),
      SubscriptionRequest.countDocuments({ status: 'approved' }),
      SubscriptionRequest.countDocuments({ status: 'rejected' })
    ]);

    // Get user statistics by plan
    const [totalUsers, activeUsers, adminUsers, freeUsers, plusUsers, proUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ $or: [{ accountType: 'admin' }, { role: 'admin' }] }),
      User.countDocuments({ 'subscription.plan': 'free' }),
      User.countDocuments({ 'subscription.plan': 'personal_plus' }),
      User.countDocuments({ 'subscription.plan': 'pro' })
    ]);

    // Get expense statistics (counts include deleted, amounts only active)
    const [totalExpenses, voiceExpenses, totalExpensesAmount, voiceExpensesAmount] = await Promise.all([
      Expense.countDocuments(), // All expenses including deleted
      Expense.countDocuments({ 'aiProcessing.isVoiceInput': true }), // All voice expenses including deleted
      Expense.aggregate([
        { $match: { status: 'active' } }, // Only active for amounts
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { status: 'active', 'aiProcessing.isVoiceInput': true } }, // Only active for amounts
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    // Get revenue statistics (counts include deleted, amounts only active)
    const [totalRevenues, voiceRevenues, totalRevenuesAmount, voiceRevenuesAmount] = await Promise.all([
      Revenue.countDocuments(), // All revenues including deleted
      Revenue.countDocuments({ 'aiProcessing.isVoiceInput': true }), // All voice revenues including deleted
      Revenue.aggregate([
        { $match: { status: 'active' } }, // Only active for amounts
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Revenue.aggregate([
        { $match: { status: 'active', 'aiProcessing.isVoiceInput': true } }, // Only active for amounts
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    // Get subscription plan distribution
    const planDistribution = await SubscriptionRequest.aggregate([
      {
        $group: {
          _id: '$plan',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Get recent requests (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRequests = await SubscriptionRequest.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Get monthly revenue (approved requests)
    const monthlyRevenue = await SubscriptionRequest.aggregate([
      {
        $match: { status: 'approved' }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 }
      },
      {
        $limit: 12
      }
    ]);

    // Get expense trends (monthly) - counts include deleted, amounts only active
    const expenseTrends = await Expense.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          count: { $sum: 1 }, // All expenses including deleted
          totalAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, '$amount', 0]
            }
          }, // Only active amounts
          voiceCount: {
            $sum: { $cond: [{ $eq: ['$aiProcessing.isVoiceInput', true] }, 1, 0] }
          } // All voice expenses including deleted
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    // Get revenue trends (monthly) - counts include deleted, amounts only active
    const revenueTrends = await Revenue.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          count: { $sum: 1 }, // All revenues including deleted
          totalAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, '$amount', 0]
            }
          }, // Only active amounts
          voiceCount: {
            $sum: { $cond: [{ $eq: ['$aiProcessing.isVoiceInput', true] }, 1, 0] }
          } // All voice revenues including deleted
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    // Get user growth trends (monthly)
    const userGrowthTrends = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          freeCount: {
            $sum: { $cond: [{ $eq: ['$subscription.plan', 'free'] }, 1, 0] }
          },
          plusCount: {
            $sum: { $cond: [{ $eq: ['$subscription.plan', 'personal_plus'] }, 1, 0] }
          },
          proCount: {
            $sum: { $cond: [{ $eq: ['$subscription.plan', 'pro'] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.json({
      success: true,
      data: {
        subscriptionRequests: {
          total: totalRequests,
          pending: pendingRequests,
          approved: approvedRequests,
          rejected: rejectedRequests,
          recent: recentRequests
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          admins: adminUsers,
          byPlan: {
            free: freeUsers,
            plus: plusUsers,
            pro: proUsers
          }
        },
        expenses: {
          total: totalExpenses,
          voice: voiceExpenses,
          totalAmount: totalExpensesAmount[0]?.total || 0,
          voiceAmount: voiceExpensesAmount[0]?.total || 0
        },
        revenues: {
          total: totalRevenues,
          voice: voiceRevenues,
          totalAmount: totalRevenuesAmount[0]?.total || 0,
          voiceAmount: voiceRevenuesAmount[0]?.total || 0
        },
        planDistribution,
        monthlyRevenue,
        expenseTrends,
        revenueTrends,
        userGrowthTrends
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
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

// @desc    Get detailed expenses data
// @route   GET /api/admin/expenses
// @access  Private (Admin only)
router.get('/expenses', protect, isAdmin, async (req, res) => {
  try {
    const Expense = require('../models/Expense');
    const { page = 1, limit = 50, voiceOnly = false } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { status: 'active' };
    if (voiceOnly === 'true') {
      query['aiProcessing.isVoiceInput'] = true;
    }

    const [expenses, total] = await Promise.all([
      Expense.find(query)
        .populate('user', 'firstName lastName email')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Expense.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        expenses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get expenses error:', error);
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

// @desc    Get detailed revenues data
// @route   GET /api/admin/revenues
// @access  Private (Admin only)
router.get('/revenues', protect, isAdmin, async (req, res) => {
  try {
    const Revenue = require('../models/Revenue');
    const { page = 1, limit = 50, voiceOnly = false } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { status: 'active' };
    if (voiceOnly === 'true') {
      query['aiProcessing.isVoiceInput'] = true;
    }

    const [revenues, total] = await Promise.all([
      Revenue.find(query)
        .populate('user', 'firstName lastName email')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Revenue.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        revenues,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get revenues error:', error);
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

// @desc    Get detailed users data by plan
// @route   GET /api/admin/users
// @access  Private (Admin only)
router.get('/users', protect, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, plan } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (plan && plan !== 'all') {
      query['subscription.plan'] = plan;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('firstName lastName email phone accountType subscription.plan subscription.status isActive createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
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
