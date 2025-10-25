const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Update user subscription (Admin only)
// @route   PUT /api/admin/users/:userId/subscription
// @access  Private (Admin only)
router.put('/users/:userId/subscription', protect, authorize('supervisor', 'company_owner'), [
  body('plan')
    .isIn(['free', 'personal_plus', 'contractor_pro', 'company_plan'])
    .withMessage('Invalid subscription plan'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'cancelled', 'expired'])
    .withMessage('Invalid subscription status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          arabic: 'فشل في التحقق',
          details: errors.array(),
          statusCode: 400
        }
      });
    }

    const { plan, status = 'active' } = req.body;
    const userId = req.params.userId;

    // Find user
    const user = await User.findById(userId);
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

    // Update subscription
    user.subscription.plan = plan;
    user.subscription.status = status;
    user.subscription.startDate = new Date();

    // Set end date for paid plans
    if (plan !== 'free') {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // 1 month from now
      user.subscription.endDate = endDate;
    } else {
      user.subscription.endDate = null;
    }

    await user.save();

    res.json({
      success: true,
      message: 'User subscription updated successfully',
      arabic: 'تم تحديث اشتراك المستخدم بنجاح',
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          subscription: user.subscription
        }
      }
    });

  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Server error',
        arabic: 'خطأ في الخادم',
        statusCode: 500
      }
    });
  }
});

// @desc    Get user subscription info (Admin only)
// @route   GET /api/admin/users/:userId/subscription
// @access  Private (Admin only)
router.get('/users/:userId/subscription', protect, authorize('supervisor', 'company_owner'), async (req, res) => {
  try {
    const userId = req.params.userId;

    const user = await User.findById(userId).select('firstName lastName email subscription');
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
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          subscription: user.subscription
        }
      }
    });

  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Server error',
        arabic: 'خطأ في الخادم',
        statusCode: 500
      }
    });
  }
});

module.exports = router;
