const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Revenue = require('../models/Revenue');
const {
  protect,
  checkCreatePermission,
  checkEditPermission,
  checkViewPermission,
  checkDeletePermission
} = require('../middleware/auth');
const { checkSubscriptionLimit } = require('../middleware/subscription');

const router = express.Router();

// @desc    Get all revenues
// @route   GET /api/revenues
// @access  Private
router.get('/', protect, checkViewPermission, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query - supervisors can view revenues for the user they're supervising
    const userId = req.isSupervisor ? req.user._id : req.user.id;
    let query = { user: userId, status: 'active' };

    // Filter by category
    if (req.query.category) {
      query.category = new RegExp(req.query.category, 'i');
    }

    // Filter by type
    if (req.query.type) {
      query.type = req.query.type;
    }

    // Filter by payment status
    if (req.query.paymentStatus) {
      query.paymentStatus = req.query.paymentStatus;
    }

    // Filter by date range
    if (req.query.startDate || req.query.endDate) {
      query.date = {};
      if (req.query.startDate) {
        query.date.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.date.$lte = new Date(req.query.endDate);
      }
    }

    const revenues = await Revenue.find(query)
      .populate('project', 'name')
      .populate('company', 'name')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Revenue.countDocuments(query);

    res.json({
      success: true,
      data: {
        revenues,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
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

// @desc    Get revenues for testing (description, category, price only) - NO AUTH REQUIRED
// @route   GET /api/revenues/test-data
// @access  Public (Temporary - for testing only)
// router.get('/test-data', async (req, res) => {
//   try {
//     const revenues = await Revenue.find({
//       status: 'active'
//     }).select('description category amount');

//     // Transform to simple objects
//     const simpleRevenues = revenues.map(revenue => ({
//       description: revenue.description || '',
//       category: revenue.category,
//       price: revenue.amount
//     }));

//     res.json({
//       success: true,
//       data: simpleRevenues
//     });
//   } catch (error) {
//     console.error('Get test revenues error:', error);
//     res.status(500).json({
//       success: false,
//       error: {
//         message: 'Server error',
//         arabic: 'خطأ في الخادم',
//         statusCode: 500
//       }
//     });
//   }
// });

// @desc    Create new revenue
// @route   POST /api/revenues
// @access  Private
router.post('/', protect, checkSubscriptionLimit('revenue'), checkCreatePermission, [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('category')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category is required and must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('type')
    .isIn(['personal', 'business', 'project'])
    .withMessage('Type must be personal, business, or project')
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

    const {
      amount,
      category,
      subcategory,
      description,
      type,
      source,
      client,
      invoice,
      project,
      company,
      paymentMethod,
      paymentStatus,
      date,
      tags,
      notes,
      aiProcessing
    } = req.body;

    // Validate project/company association based on type
    // Convert empty strings to undefined for optional fields
    const cleanedDescription = description && description.trim() ? description.trim() : undefined;
    if (type === 'project' && !project) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Project is required for project-type revenues',
          arabic: 'المشروع مطلوب للإيرادات من نوع مشروع',
          statusCode: 400
        }
      });
    }

    if (type === 'business' && !company) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Company is required for business-type revenues',
          arabic: 'الشركة مطلوبة للإيرادات من نوع عمل',
          statusCode: 400
        }
      });
    }

    // Create revenue
    const revenue = await Revenue.create({
      user: req.user.id,
      amount,
      category,
      subcategory,
      description: cleanedDescription,
      type,
      source: source || 'other',
      client,
      invoice,
      project: type === 'project' ? project : undefined,
      company: type === 'business' ? company : undefined,
      paymentMethod: paymentMethod || 'cash',
      paymentStatus: paymentStatus || 'received',
      date: date ? new Date(date) : new Date(),
      tags,
      notes,
      aiProcessing: aiProcessing || {
        isVoiceInput: false,
        processedAt: new Date()
      }
    });

    // Increment voice input counter if this was created via voice
    if (aiProcessing && aiProcessing.isVoiceInput) {
      const User = require('../models/User');
      const user = await User.findById(req.user.id);
      if (user) {
        await user.incrementUsage('voiceInput');
      }
    }

    // Update project budget if this is a project revenue
    if (type === 'project' && project) {
      const Project = require('../models/Project');
      const projectDoc = await Project.findById(project);
      if (projectDoc) {
        await projectDoc.addRevenue(revenue._id, amount, category, req.user.id);
      }
    }

    // Populate the created revenue
    await revenue.populate([
      { path: 'project', select: 'name' },
      { path: 'company', select: 'name' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Revenue created successfully',
      arabic: 'تم إنشاء الإيراد بنجاح',
      data: { revenue }
    });
  } catch (error) {
    console.error('Create revenue error:', error);
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

// @desc    Get revenue statistics
// @route   GET /api/revenues/stats/summary
// @access  Private
router.get('/stats/summary', protect, checkViewPermission, async (req, res) => {
  try {
    // Build query - supervisors can view revenues for the user they're supervising
    const userId = req.isSupervisor ? req.user._id : req.user.id;

    const { year, month } = req.query;
    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    // Get monthly summary
    const monthlySummary = await Revenue.getMonthlySummary(userId, currentYear, currentMonth);

    // Get client summary
    const clientSummary = await Revenue.getClientSummary(userId);

    // Get overdue revenues
    const overdueRevenues = await Revenue.findOverdue(userId);

    res.json({
      success: true,
      data: {
        monthlySummary,
        clientSummary,
        overdueRevenues,
        period: {
          year: currentYear,
          month: currentMonth
        }
      }
    });
  } catch (error) {
    console.error('Get revenue stats error:', error);
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

// @desc    Get revenue by ID
// @route   GET /api/revenues/:id
// @access  Private
router.get('/:id', protect, checkViewPermission, async (req, res) => {
  try {
    const revenue = await Revenue.findById(req.params.id)
      .populate('project', 'name')
      .populate('company', 'name');

    if (!revenue) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Revenue not found',
          arabic: 'الإيراد غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can view this revenue (supervisors can view for supervised user)
    const userId = req.isSupervisor ? req.user._id.toString() : req.user.id;
    if (revenue.user.toString() !== userId &&
      !req.isSupervisor &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this revenue',
          arabic: 'غير مخول لعرض هذا الإيراد',
          statusCode: 403
        }
      });
    }

    res.json({
      success: true,
      data: { revenue }
    });
  } catch (error) {
    console.error('Get revenue error:', error);
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

// @desc    Update revenue
// @route   PUT /api/revenues/:id
// @access  Private
router.put('/:id', protect, checkEditPermission, [
  body('amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('category')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('paymentStatus')
    .optional()
    .isIn(['pending', 'received', 'overdue', 'cancelled'])
    .withMessage('Invalid payment status')
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

    const revenue = await Revenue.findById(req.params.id);
    if (!revenue) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Revenue not found',
          arabic: 'الإيراد غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this revenue
    if (revenue.user.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this revenue',
          arabic: 'غير مخول لتعديل هذا الإيراد',
          statusCode: 403
        }
      });
    }

    const {
      amount,
      category,
      subcategory,
      description,
      source,
      client,
      invoice,
      paymentMethod,
      paymentStatus,
      date,
      tags,
      notes
    } = req.body;

    // Store old values for project budget update
    const oldAmount = revenue.amount;
    const oldProject = revenue.project;

    // Clean description: convert empty strings to undefined
    const cleanedDescription = description !== undefined
      ? (description.trim() ? description.trim() : undefined)
      : undefined;

    // Update revenue
    const updatedRevenue = await Revenue.findByIdAndUpdate(
      req.params.id,
      {
        ...(amount && { amount }),
        ...(category && { category }),
        ...(subcategory && { subcategory }),
        ...(cleanedDescription !== undefined && { description: cleanedDescription }),
        ...(source && { source }),
        ...(client && { client }),
        ...(invoice && { invoice }),
        ...(paymentMethod && { paymentMethod }),
        ...(paymentStatus && { paymentStatus }),
        ...(date && { date: new Date(date) }),
        ...(tags && { tags }),
        ...(notes && { notes })
      },
      { new: true, runValidators: true }
    ).populate([
      { path: 'project', select: 'name' },
      { path: 'company', select: 'name' }
    ]);

    // Update project budget if this revenue is linked to a project
    if (updatedRevenue.project) {
      const Project = require('../models/Project');
      const projectDoc = await Project.findById(updatedRevenue.project);
      if (projectDoc) {
        // If amount changed, we need to update the revenue entry in the project
        if (amount && amount !== oldAmount) {
          // Find and update the revenue entry in the project
          const revenueEntry = projectDoc.revenues.find(rev => rev.revenue.toString() === updatedRevenue._id.toString());
          if (revenueEntry) {
            revenueEntry.amount = amount;
            await projectDoc.save();
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'Revenue updated successfully',
      arabic: 'تم تحديث الإيراد بنجاح',
      data: { revenue: updatedRevenue }
    });
  } catch (error) {
    console.error('Update revenue error:', error);
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

// @desc    Delete revenue
// @route   DELETE /api/revenues/:id
// @access  Private
router.delete('/:id', protect, checkDeletePermission, async (req, res) => {
  try {
    const revenue = await Revenue.findById(req.params.id);
    if (!revenue) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Revenue not found',
          arabic: 'الإيراد غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can delete this revenue
    if (revenue.user.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to delete this revenue',
          arabic: 'غير مخول لحذف هذا الإيراد',
          statusCode: 403
        }
      });
    }

    // Update project budget if this revenue is linked to a project
    if (revenue.project) {
      const Project = require('../models/Project');
      const projectDoc = await Project.findById(revenue.project);
      if (projectDoc) {
        // Remove the revenue entry from the project
        projectDoc.revenues = projectDoc.revenues.filter(rev => rev.revenue.toString() !== revenue._id.toString());
        await projectDoc.save();
      }
    }

    // Soft delete by setting status to deleted
    revenue.status = 'deleted';
    await revenue.save();

    res.json({
      success: true,
      message: 'Revenue deleted successfully',
      arabic: 'تم حذف الإيراد بنجاح'
    });
  } catch (error) {
    console.error('Delete revenue error:', error);
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

// @desc    Get revenue categories
// @route   GET /api/revenues/categories
// @access  Private
router.get('/categories', protect, checkViewPermission, async (req, res) => {
  try {
    const { type } = req.query;

    // Build query - supervisors can view revenues for the user they're supervising
    const userId = req.isSupervisor ? req.user._id : req.user.id;

    // Get categories from user's revenues
    const matchQuery = {
      user: userId,
      status: 'active'
    };

    if (type) {
      matchQuery.type = type;
    }

    const categories = await Revenue.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          lastUsed: { $max: '$date' }
        }
      },
      {
        $project: {
          name: '$_id',
          count: 1,
          totalAmount: 1,
          lastUsed: 1,
          _id: 0
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    // Get predefined categories based on account type
    const predefinedCategories = getPredefinedRevenueCategories(req.user.accountType, type);

    res.json({
      success: true,
      data: {
        categories,
        predefinedCategories
      }
    });
  } catch (error) {
    console.error('Get revenue categories error:', error);
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

// @desc    Get revenue analytics
// @route   GET /api/revenues/analytics
// @access  Private
router.get('/analytics', protect, checkViewPermission, async (req, res) => {
  try {
    const { period = 'month', year, month } = req.query;
    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    let startDate, endDate;

    if (period === 'month') {
      startDate = new Date(currentYear, currentMonth - 1, 1);
      endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);
    } else if (period === 'year') {
      startDate = new Date(currentYear, 0, 1);
      endDate = new Date(currentYear, 11, 31, 23, 59, 59);
    } else if (period === 'week') {
      const today = new Date();
      const dayOfWeek = today.getDay();
      startDate = new Date(today);
      startDate.setDate(today.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    }

    // Build query - supervisors can view revenues for the user they're supervising
    const userId = req.isSupervisor ? req.user._id : req.user.id;

    // Category breakdown
    const categoryBreakdown = await Revenue.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate },
          status: 'active'
        }
      },
      {
        $group: {
          _id: '$category',
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { amount: -1 } }
    ]);

    // Client breakdown
    const clientBreakdown = await Revenue.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate },
          status: 'active',
          client: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$client',
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { amount: -1 } }
    ]);

    // Payment status breakdown
    const paymentStatusBreakdown = await Revenue.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate },
          status: 'active'
        }
      },
      {
        $group: {
          _id: '$paymentStatus',
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Monthly trend (for year view)
    let monthlyTrend = [];
    if (period === 'year') {
      monthlyTrend = await Revenue.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            date: { $gte: startDate, $lte: endDate },
            status: 'active'
          }
        },
        {
          $group: {
            _id: { $month: '$date' },
            amount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    }

    // Total summary
    const totalSummary = await Revenue.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate },
          status: 'active'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          averageAmount: { $avg: '$amount' },
          maxAmount: { $max: '$amount' },
          minAmount: { $min: '$amount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: { type: period, year: currentYear, month: currentMonth },
        summary: totalSummary[0] || {
          totalAmount: 0,
          totalCount: 0,
          averageAmount: 0,
          maxAmount: 0,
          minAmount: 0
        },
        categoryBreakdown,
        clientBreakdown,
        paymentStatusBreakdown,
        monthlyTrend
      }
    });
  } catch (error) {
    console.error('Get revenue analytics error:', error);
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

// @desc    Update payment status
// @route   PUT /api/revenues/:id/payment-status
// @access  Private
router.put('/:id/payment-status', protect, checkEditPermission, [
  body('paymentStatus')
    .isIn(['pending', 'received', 'overdue', 'cancelled'])
    .withMessage('Invalid payment status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
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

    const revenue = await Revenue.findById(req.params.id);
    if (!revenue) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Revenue not found',
          arabic: 'الإيراد غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this revenue
    if (revenue.user.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this revenue',
          arabic: 'غير مخول لتعديل هذا الإيراد',
          statusCode: 403
        }
      });
    }

    const { paymentStatus, notes } = req.body;

    // Update payment status
    revenue.paymentStatus = paymentStatus;
    if (notes) {
      revenue.notes = notes;
    }
    await revenue.save();

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      arabic: 'تم تحديث حالة الدفع بنجاح',
      data: { revenue }
    });
  } catch (error) {
    console.error('Update payment status error:', error);
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

// @desc    Get overdue revenues
// @route   GET /api/revenues/overdue
// @access  Private
router.get('/overdue', protect, checkViewPermission, async (req, res) => {
  try {
    // Build query - supervisors can view revenues for the user they're supervising
    const userId = req.isSupervisor ? req.user._id : req.user.id;

    const overdueRevenues = await Revenue.find({
      user: userId,
      status: 'active',
      paymentStatus: 'overdue'
    })
      .populate('project', 'name')
      .populate('company', 'name')
      .sort({ dueDate: 1 });

    const totalOverdueAmount = overdueRevenues.reduce((sum, revenue) => sum + revenue.amount, 0);

    res.json({
      success: true,
      data: {
        revenues: overdueRevenues,
        totalAmount: totalOverdueAmount,
        count: overdueRevenues.length
      }
    });
  } catch (error) {
    console.error('Get overdue revenues error:', error);
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

// Helper function to get predefined revenue categories
function getPredefinedRevenueCategories(accountType, type) {
  const baseCategories = [
    'راتب',
    'عمل حر',
    'استثمارات',
    'مبيعات',
    'عمولة',
    'هدايا',
    'أخرى'
  ];

  const businessCategories = [
    'مبيعات منتجات',
    'خدمات',
    'استشارات',
    'تدريب',
    'تسويق',
    'عمولة مبيعات',
    'عقود',
    'أخرى'
  ];

  const projectCategories = [
    'دفعة أولى',
    'دفعة متوسطة',
    'دفعة نهائية',
    'إضافات',
    'تعديلات',
    'عمولة',
    'أخرى'
  ];

  if (type === 'business' || (accountType === 'company' && !type)) {
    return businessCategories;
  } else if (type === 'project') {
    return projectCategories;
  } else {
    return baseCategories;
  }
}

module.exports = router;
