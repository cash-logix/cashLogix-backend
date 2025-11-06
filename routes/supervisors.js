const express = require('express');
const { body, validationResult } = require('express-validator');
const Supervisor = require('../models/Supervisor');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const SubscriptionService = require('../services/subscriptionService');

const router = express.Router();

// @desc    Get all supervisors for a user
// @route   GET /api/supervisors
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const supervisors = await Supervisor.find({ user: req.user.id, isActive: true })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { supervisors }
    });
  } catch (error) {
    console.error('Get supervisors error:', error);
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

// @desc    Create a new supervisor
// @route   POST /api/supervisors
// @access  Private
router.post('/', protect, [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters')
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

    const { username, password, name } = req.body;

    // Count actual active supervisors (not the stored counter)
    const activeSupervisorsCount = await Supervisor.countDocuments({
      user: req.user.id,
      isActive: true
    });

    // Get subscription limits
    const user = await User.findById(req.user.id);
    
    // Check if user is in active free trial - they get 1 supervisor
    const isInActiveFreeTrial = user.subscription.freeTrial?.isActive &&
      user.subscription.freeTrial?.endDate &&
      new Date() <= new Date(user.subscription.freeTrial.endDate);

    const limits = user.getSubscriptionLimits();
    const supervisorLimit = limits.supervisors;

    // Check if user can add more supervisors based on actual count
    if (supervisorLimit !== Infinity && activeSupervisorsCount >= supervisorLimit) {
      const usage = {
        used: activeSupervisorsCount,
        limit: supervisorLimit,
        remaining: Math.max(0, supervisorLimit - activeSupervisorsCount)
      };

      // Get upgrade message
      const effectivePlan = user.getEffectivePlan();
      let upgradeMessage;
      
      if (isInActiveFreeTrial) {
        upgradeMessage = 'لقد وصلت إلى الحد الأقصى للمشرفين في التجربة المجانية (1 مشرف). قم بالترقية لإضافة المزيد.';
      } else {
        upgradeMessage = SubscriptionService.getUpgradeMessage(effectivePlan, 'supervisor', usage);
      }

      return res.status(403).json({
        success: false,
        error: {
          message: upgradeMessage,
          arabic: upgradeMessage,
          statusCode: 403,
          usage
        }
      });
    }

    // Check if username already exists
    const existingSupervisor = await Supervisor.findByUsername(username);
    if (existingSupervisor) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Username already exists',
          arabic: 'اسم المستخدم موجود بالفعل',
          statusCode: 400
        }
      });
    }

    // Create supervisor
    const supervisor = await Supervisor.create({
      user: req.user.id,
      username: username.toLowerCase().trim(),
      password,
      name: name || username
    });

    // Sync supervisor usage counter with actual count
    const actualCount = await Supervisor.countDocuments({
      user: req.user.id,
      isActive: true
    });
    await User.findByIdAndUpdate(req.user.id, {
      $set: { 'usageTracking.total.supervisors': actualCount }
    });

    // Remove password from response
    const supervisorData = supervisor.toObject();
    delete supervisorData.password;

    res.status(201).json({
      success: true,
      message: 'Supervisor created successfully',
      arabic: 'تم إنشاء المشرف بنجاح',
      data: { supervisor: supervisorData }
    });
  } catch (error) {
    console.error('Create supervisor error:', error);
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

// @desc    Update supervisor
// @route   PUT /api/supervisors/:id
// @access  Private
router.put('/:id', protect, [
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters')
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

    const supervisor = await Supervisor.findById(req.params.id);
    if (!supervisor) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Supervisor not found',
          arabic: 'المشرف غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user owns this supervisor
    if (supervisor.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to update this supervisor',
          arabic: 'غير مخول لتحديث هذا المشرف',
          statusCode: 403
        }
      });
    }

    const { password, name } = req.body;

    // Update supervisor
    if (password) {
      supervisor.password = password; // Will be hashed by pre-save middleware
    }
    if (name) {
      supervisor.name = name;
    }

    await supervisor.save();

    // Remove password from response
    const supervisorData = supervisor.toObject();
    delete supervisorData.password;

    res.json({
      success: true,
      message: 'Supervisor updated successfully',
      arabic: 'تم تحديث المشرف بنجاح',
      data: { supervisor: supervisorData }
    });
  } catch (error) {
    console.error('Update supervisor error:', error);
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

// @desc    Delete supervisor
// @route   DELETE /api/supervisors/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const supervisor = await Supervisor.findById(req.params.id);
    if (!supervisor) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Supervisor not found',
          arabic: 'المشرف غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user owns this supervisor
    if (supervisor.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to delete this supervisor',
          arabic: 'غير مخول لحذف هذا المشرف',
          statusCode: 403
        }
      });
    }

    // Soft delete by setting isActive to false
    supervisor.isActive = false;
    await supervisor.save();

    // Sync supervisor usage counter with actual count
    const actualCount = await Supervisor.countDocuments({
      user: req.user.id,
      isActive: true
    });
    await User.findByIdAndUpdate(req.user.id, {
      $set: { 'usageTracking.total.supervisors': actualCount }
    });

    res.json({
      success: true,
      message: 'Supervisor deleted successfully',
      arabic: 'تم حذف المشرف بنجاح'
    });
  } catch (error) {
    console.error('Delete supervisor error:', error);
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

