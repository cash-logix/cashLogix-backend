const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const {
  protect,
  authorize,
  checkUserManagementPermission,
  checkOwnership
} = require('../middleware/auth');

const router = express.Router();

// @desc    Get current user profile
// @route   GET /api/users/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('company', 'name');

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
      data: { user }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
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

// @desc    Fix user role for company accounts
// @route   PUT /api/users/me/fix-role
// @access  Private
router.put('/me/fix-role', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

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

    // Fix role based on account type
    if (user.accountType === 'company' && user.role !== 'company_owner') {
      user.role = 'company_owner';
      await user.save();

      res.json({
        success: true,
        message: 'User role updated successfully',
        arabic: 'تم تحديث دور المستخدم بنجاح',
        data: {
          user: {
            id: user._id,
            role: user.role,
            accountType: user.accountType
          }
        }
      });
    } else {
      res.json({
        success: true,
        message: 'User role is already correct',
        arabic: 'دور المستخدم صحيح بالفعل',
        data: {
          user: {
            id: user._id,
            role: user.role,
            accountType: user.accountType
          }
        }
      });
    }
  } catch (error) {
    console.error('Fix user role error:', error);
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

// @desc    Get all users (for admins)
// @route   GET /api/users
// @access  Private (Admin only)
router.get('/', protect, authorize('supervisor', 'company_owner'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find({ isActive: true })
      .select('-password')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments({ isActive: true });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
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

// @desc    Get user invitations
// @route   GET /api/users/invitations
// @access  Private (Paid plans only)
router.get('/invitations', protect, async (req, res) => {
  // Check subscription plan - only paid plans can access invitations
  const paidPlans = ['personal_plus', 'pro', 'company_plan'];
  const userPlan = req.user?.subscription?.plan || 'free';

  if (!paidPlans.includes(userPlan)) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Partner invitations feature requires a paid subscription plan',
        arabic: 'ميزة دعوات الشركاء تتطلب اشتراك مدفوع',
        statusCode: 403,
        requiresUpgrade: true
      }
    });
  }
  try {
    const Project = require('../models/Project');

    // Find all projects where the current user is invited as a partner
    const projects = await Project.find({
      'partners.user': req.user.id,
      'partners.status': 'pending'
    })
      .populate('owner', 'firstName lastName email')
      .populate('partners.user', 'firstName lastName email')
      .select('name description startDate endDate status priority partners');

    // Filter and format the invitations
    const invitations = projects
      .map(project => {
        const partnerInvitation = project.partners.find(
          partner => partner.user._id.toString() === req.user.id && partner.status === 'pending'
        );

        // Only return invitation data if a pending invitation exists
        if (!partnerInvitation) {
          return null;
        }

        return {
          id: partnerInvitation._id,
          project: {
            id: project._id,
            name: project.name,
            description: project.description,
            startDate: project.startDate,
            endDate: project.endDate,
            status: project.status,
            priority: project.priority,
            owner: project.owner
          },
          role: partnerInvitation.role,
          invitedBy: partnerInvitation.invitedBy,
          invitedAt: partnerInvitation.invitedAt,
          permissions: partnerInvitation.permissions
        };
      })
      .filter(invitation => invitation !== null); // Remove null entries

    res.json({
      success: true,
      data: { invitations }
    });
  } catch (error) {
    console.error('Get user invitations error:', error);
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

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('company', 'name industry')
      .populate('partners.user', 'firstName lastName email');

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

    // Check if user can view this profile
    if (user._id.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this profile',
          arabic: 'غير مخول لعرض هذا الملف الشخصي',
          statusCode: 403
        }
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get user error:', error);
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

// @desc    Update current user profile
// @route   PUT /api/users/me
// @access  Private
router.put('/me', protect, [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .matches(/^(\+20|0)?1[0-9]{9}$/)
    .withMessage('Please provide a valid Egyptian phone number'),
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters')
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

    const user = await User.findById(req.user.id);
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

    // Check if user can update this profile
    // For /me endpoint, user can always update their own profile
    const { firstName, lastName, phone, bio, dateOfBirth, gender, preferences } = req.body;

    // Update user fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (bio !== undefined) user.bio = bio;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
    if (gender !== undefined) user.gender = gender;
    if (preferences !== undefined) {
      user.preferences = {
        ...user.preferences,
        ...preferences
      };
    }

    await user.save();

    const updatedUser = await User.findById(req.user.id)
      .select('-password')
      .populate('company', 'name');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      arabic: 'تم تحديث الملف الشخصي بنجاح',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update user error:', error);
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

// @desc    Update user profile
// @route   PUT /api/users/:id
// @access  Private
router.put('/:id', protect, [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .matches(/^(\+20|0)?1[0-9]{9}$/)
    .withMessage('Please provide a valid Egyptian phone number'),
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters')
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

    const user = await User.findById(req.params.id);
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

    // Check if user can update this profile
    if (user._id.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to update this profile',
          arabic: 'غير مخول لتحديث هذا الملف الشخصي',
          statusCode: 403
        }
      });
    }

    const { firstName, lastName, phone, bio, dateOfBirth, gender } = req.body;

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phone && { phone }),
        ...(bio && { bio }),
        ...(dateOfBirth && { dateOfBirth }),
        ...(gender && { gender })
      },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      arabic: 'تم تحديث الملف الشخصي بنجاح',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update user error:', error);
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

// @desc    Update user preferences
// @route   PUT /api/users/:id/preferences
// @access  Private
router.put('/:id/preferences', protect, [
  body('language')
    .optional()
    .isIn(['ar', 'en'])
    .withMessage('Language must be ar or en'),
  body('currency')
    .optional()
    .isIn(['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'GBP', 'LBP', 'JPY', 'CNY', 'INR', 'TRY'])
    .withMessage('Invalid currency code'),
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Theme must be light, dark, or auto')
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

    const user = await User.findById(req.params.id);
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

    // Check if user can update this profile
    if (user._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to update this profile',
          arabic: 'غير مخول لتحديث هذا الملف الشخصي',
          statusCode: 403
        }
      });
    }

    const { language, currency, theme, timezone, notifications } = req.body;

    // Update preferences
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(language && { 'preferences.language': language }),
          ...(currency && { 'preferences.currency': currency }),
          ...(theme && { 'preferences.theme': theme }),
          ...(timezone && { 'preferences.timezone': timezone }),
          ...(notifications && { 'preferences.notifications': { ...user.preferences.notifications, ...notifications } })
        }
      },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      arabic: 'تم تحديث التفضيلات بنجاح',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update preferences error:', error);
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

// @desc    Change password
// @route   PUT /api/users/:id/password
// @access  Private
router.put('/:id/password', protect, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
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

    const user = await User.findById(req.params.id).select('+password');
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

    // Check if user can change this password
    if (user._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to change this password',
          arabic: 'غير مخول لتغيير كلمة المرور هذه',
          statusCode: 403
        }
      });
    }

    const { currentPassword, newPassword } = req.body;

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
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        statusCode: 500
      }
    });
  }
});

// @desc    Deactivate user account
// @route   PUT /api/users/:id/deactivate
// @access  Private
router.put('/:id/deactivate', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
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

    // Check if user can deactivate this account
    if (user._id.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to deactivate this account',
          arabic: 'غير مخول لإلغاء تفعيل هذا الحساب',
          statusCode: 403
        }
      });
    }

    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'Account deactivated successfully',
      arabic: 'تم إلغاء تفعيل الحساب بنجاح'
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
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