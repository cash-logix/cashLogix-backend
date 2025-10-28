const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const SubscriptionService = require('../services/subscriptionService');
const User = require('../models/User');

const router = express.Router();

// @desc    Get current user's subscription and usage stats
// @route   GET /api/subscription/stats
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const stats = await SubscriptionService.getUserUsageStats(req.user.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get subscription stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        details: error.message
      }
    });
  }
});

// @desc    Get all available plans and pricing
// @route   GET /api/subscription/plans
// @access  Public
router.get('/plans', (req, res) => {
  try {
    const plans = SubscriptionService.getPlanPricing();

    res.json({
      success: true,
      data: { plans }
    });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        details: error.message
      }
    });
  }
});

// @desc    Upgrade subscription plan
// @route   POST /api/subscription/upgrade
// @access  Private
router.post('/upgrade', protect, [
  body('plan')
    .isIn(['personal_plus', 'pro', 'company_plan'])
    .withMessage('Invalid plan selection'),
  body('durationMonths')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Duration must be between 1 and 12 months'),
  body('paymentMethod')
    .optional()
    .isIn(['vodafone_cash', 'instapay', 'bank_transfer'])
    .withMessage('Invalid payment method')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          arabic: 'فشل التحقق من البيانات',
          details: errors.array()
        }
      });
    }

    const { plan, durationMonths = 1, paymentMethod } = req.body;

    // Check if downgrading
    const user = await User.findById(req.user.id);
    const planOrder = { 'free': 0, 'personal_plus': 1, 'pro': 2, 'company_plan': 3 };

    if (planOrder[plan] < planOrder[user.subscription.plan]) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot downgrade plan. Please contact support for assistance.',
          arabic: 'لا يمكن تخفيض الخطة. يرجى الاتصال بالدعم للمساعدة.'
        }
      });
    }

    // Upgrade subscription
    const updatedUser = await SubscriptionService.upgradeSubscription(
      req.user.id,
      plan,
      durationMonths
    );

    // Update payment method if provided
    if (paymentMethod) {
      updatedUser.subscription.paymentMethod = paymentMethod;
      await updatedUser.save();
    }

    // Get updated stats
    const stats = await SubscriptionService.getUserUsageStats(req.user.id);

    res.json({
      success: true,
      message: 'Subscription upgraded successfully',
      arabic: 'تم ترقية الاشتراك بنجاح',
      data: {
        subscription: updatedUser.getSubscriptionInfo(),
        stats
      }
    });
  } catch (error) {
    console.error('Upgrade subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        details: error.message
      }
    });
  }
});

// @desc    Cancel subscription (downgrade to free)
// @route   POST /api/subscription/cancel
// @access  Private
router.post('/cancel', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.subscription.plan === 'free') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You are already on the free plan',
          arabic: 'أنت بالفعل على الخطة المجانية'
        }
      });
    }

    // Downgrade to free plan
    user.subscription.plan = 'free';
    user.subscription.status = 'cancelled';
    user.subscription.endDate = null;
    user.subscription.autoRenew = false;

    await user.save();

    res.json({
      success: true,
      message: 'Subscription cancelled successfully. You have been downgraded to the free plan.',
      arabic: 'تم إلغاء الاشتراك بنجاح. تم تخفيضك إلى الخطة المجانية.',
      data: {
        subscription: user.getSubscriptionInfo()
      }
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        details: error.message
      }
    });
  }
});

// @desc    Get subscription usage history
// @route   GET /api/subscription/history
// @access  Private
router.get('/history', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    // In a production environment, you would fetch this from a separate subscription history collection
    // For now, we'll return the current subscription info
    res.json({
      success: true,
      data: {
        currentSubscription: user.getSubscriptionInfo(),
        usageTracking: user.usageTracking,
        message: 'Full subscription history feature coming soon',
        arabic: 'ميزة سجل الاشتراك الكامل قريبًا'
      }
    });
  } catch (error) {
    console.error('Get subscription history error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        details: error.message
      }
    });
  }
});

// @desc    Check if user can perform a specific action
// @route   GET /api/subscription/can/:action
// @access  Private
router.get('/can/:action', protect, async (req, res) => {
  try {
    const { action } = req.params;

    const validActions = ['voiceInput', 'expense', 'revenue', 'supervisor', 'project', 'partner'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid action type',
          arabic: 'نوع إجراء غير صالح'
        }
      });
    }

    const result = await SubscriptionService.checkLimit(req.user.id, action);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Check action error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        details: error.message
      }
    });
  }
});

module.exports = router;

