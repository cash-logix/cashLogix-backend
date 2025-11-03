const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const {
  protect,
  checkCreatePermission,
  checkEditPermission,
  checkViewPermission,
  checkDeletePermission,
  checkApprovalPermission
} = require('../middleware/auth');
const { checkSubscriptionLimit } = require('../middleware/subscription');

const router = express.Router();

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
router.get('/', protect, checkViewPermission, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query - supervisors can view expenses for the user they're supervising
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

    // Filter by amount range
    if (req.query.minAmount || req.query.maxAmount) {
      query.amount = {};
      if (req.query.minAmount) {
        query.amount.$gte = parseFloat(req.query.minAmount);
      }
      if (req.query.maxAmount) {
        query.amount.$lte = parseFloat(req.query.maxAmount);
      }
    }

    // Search functionality
    if (req.query.search) {
      query.$or = [
        { description: new RegExp(req.query.search, 'i') },
        { category: new RegExp(req.query.search, 'i') },
        { subcategory: new RegExp(req.query.search, 'i') },
        { tags: { $in: [new RegExp(req.query.search, 'i')] } },
        { location: new RegExp(req.query.search, 'i') },
        { notes: new RegExp(req.query.search, 'i') }
      ];
    }

    const expenses = await Expense.find(query)
      .populate('project', 'name')
      .populate('company', 'name')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Expense.countDocuments(query);

    res.json({
      success: true,
      data: {
        expenses,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
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

// @desc    Get expenses for testing (description, category, price only) - NO AUTH REQUIRED
// @route   GET /api/expenses/test-data
// @access  Public (Temporary - for testing only)
// router.get('/test-data', async (req, res) => {
//   try {
//     const expenses = await Expense.find({
//       status: 'active'
//     }).select('description category amount');

//     // Transform to simple objects
//     const simpleExpenses = expenses.map(expense => ({
//       description: expense.description || '',
//       category: expense.category,
//       price: expense.amount
//     }));

//     res.json({
//       success: true,
//       data: simpleExpenses
//     });
//   } catch (error) {
//     console.error('Get test expenses error:', error);
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

// @desc    Get expense categories
// @route   GET /api/expenses/categories
// @access  Private
router.get('/categories', protect, checkViewPermission, async (req, res) => {
  try {
    const { type } = req.query;

    // Get categories from user's expenses
    const matchQuery = {
      user: req.user.id,
      status: 'active'
    };

    if (type) {
      matchQuery.type = type;
    }

    const categories = await Expense.aggregate([
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
      { $sort: { count: -1 } }
    ]);

    // Get predefined categories based on account type
    const predefinedCategories = getPredefinedCategories(req.user.accountType, type);

    res.json({
      success: true,
      data: {
        categories,
        predefinedCategories
      }
    });
  } catch (error) {
    console.error('Get categories error:', error);
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

// @desc    Get expense analytics
// @route   GET /api/expenses/analytics
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

    // Build query - supervisors can view expenses for the user they're supervising
    const userId = req.isSupervisor ? req.user._id : req.user.id;

    // Category breakdown
    const categoryBreakdown = await Expense.aggregate([
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

    // Monthly trend (for year view)
    let monthlyTrend = [];
    if (period === 'year') {
      monthlyTrend = await Expense.aggregate([
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

    // Payment method breakdown
    const paymentMethodBreakdown = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate },
          status: 'active'
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Total summary
    const totalSummary = await Expense.aggregate([
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
        monthlyTrend,
        paymentMethodBreakdown
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

// @desc    Get expense by ID
// @route   GET /api/expenses/:id
// @access  Private
router.get('/:id', protect, checkViewPermission, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('project', 'name')
      .populate('company', 'name');

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Expense not found',
          arabic: 'المصروف غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can view this expense (supervisors can view for supervised user)
    const userId = req.isSupervisor ? req.user._id.toString() : req.user.id;
    if (expense.user.toString() !== userId &&
      !req.isSupervisor &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this expense',
          arabic: 'غير مخول لعرض هذا المصروف',
          statusCode: 403
        }
      });
    }

    res.json({
      success: true,
      data: { expense }
    });
  } catch (error) {
    console.error('Get expense error:', error);
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

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private
router.post('/', protect, checkSubscriptionLimit('expense'), checkCreatePermission, [
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
    .withMessage('Type must be personal, business, or project'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date')
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
      paymentMethod,
      project,
      company,
      date,
      tags,
      location,
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
          message: 'Project is required for project-type expenses',
          arabic: 'المشروع مطلوب للمصروفات من نوع مشروع',
          statusCode: 400
        }
      });
    }

    if (type === 'business' && !company) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Company is required for business-type expenses',
          arabic: 'الشركة مطلوبة للمصروفات من نوع عمل',
          statusCode: 400
        }
      });
    }

    // Create expense
    const expense = await Expense.create({
      user: req.user.id,
      amount,
      category,
      subcategory,
      description: cleanedDescription,
      type,
      paymentMethod: paymentMethod || 'cash',
      project: type === 'project' ? project : undefined,
      company: type === 'business' ? company : undefined,
      date: date ? new Date(date) : new Date(),
      tags,
      location,
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

    // Update project budget if this is a project expense
    if (type === 'project' && project) {
      const Project = require('../models/Project');
      const projectDoc = await Project.findById(project);
      if (projectDoc) {
        await projectDoc.addExpense(expense._id, amount, category, req.user.id);
      }
    }

    // Create approval workflow for business expenses
    let approval = null;
    if (type === 'business' && company) {
      const Approval = require('../models/Approval');
      try {
        // Determine workflow based on amount
        const workflow = amount > 1000 ? 'multi_level' : 'single_approval';
        approval = await Approval.createExpenseApproval(
          expense,
          company,
          req.user.id,
          workflow
        );
      } catch (approvalError) {
        console.error('Approval creation error:', approvalError);
        // Don't fail the expense creation if approval fails
      }
    }

    // Populate the created expense
    await expense.populate([
      { path: 'project', select: 'name' },
      { path: 'company', select: 'name' }
    ]);

    const responseData = { expense };
    if (approval) {
      responseData.approval = approval;
    }

    res.status(201).json({
      success: true,
      message: approval ?
        'Expense created successfully and sent for approval' :
        'Expense created successfully',
      arabic: approval ?
        'تم إنشاء المصروف بنجاح وإرساله للموافقة' :
        'تم إنشاء المصروف بنجاح',
      data: responseData
    });
  } catch (error) {
    console.error('Create expense error:', error);
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

// @desc    Update expense
// @route   PUT /api/expenses/:id
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
    .withMessage('Description must be less than 500 characters')
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

    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Expense not found',
          arabic: 'المصروف غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this expense
    if (expense.user.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this expense',
          arabic: 'غير مخول لتعديل هذا المصروف',
          statusCode: 403
        }
      });
    }

    const {
      amount,
      category,
      subcategory,
      description,
      paymentMethod,
      date,
      tags,
      location,
      notes,
      aiProcessing
    } = req.body;

    // Store old values for project budget update
    const oldAmount = expense.amount;
    const oldProject = expense.project;

    // Clean description: convert empty strings to undefined
    const cleanedDescription = description !== undefined
      ? (description.trim() ? description.trim() : undefined)
      : undefined;

    // Update expense
    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id,
      {
        ...(amount && { amount }),
        ...(category && { category }),
        ...(subcategory && { subcategory }),
        ...(cleanedDescription !== undefined && { description: cleanedDescription }),
        ...(paymentMethod && { paymentMethod }),
        ...(date && { date: new Date(date) }),
        ...(tags && { tags }),
        ...(location && { location }),
        ...(notes && { notes }),
        ...(aiProcessing && { aiProcessing })
      },
      { new: true, runValidators: true }
    ).populate([
      { path: 'project', select: 'name' },
      { path: 'company', select: 'name' }
    ]);

    // Update project budget if this expense is linked to a project
    if (updatedExpense.project) {
      const Project = require('../models/Project');
      const projectDoc = await Project.findById(updatedExpense.project);
      if (projectDoc) {
        // If amount changed, update the budget
        if (amount && amount !== oldAmount) {
          // Remove old amount and add new amount
          projectDoc.budget.spent = projectDoc.budget.spent - oldAmount + amount;
          projectDoc.budget.remaining = projectDoc.budget.total - projectDoc.budget.spent;
          await projectDoc.save();
        }
      }
    }

    res.json({
      success: true,
      message: 'Expense updated successfully',
      arabic: 'تم تحديث المصروف بنجاح',
      data: { expense: updatedExpense }
    });
  } catch (error) {
    console.error('Update expense error:', error);
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

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
router.delete('/:id', protect, checkDeletePermission, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Expense not found',
          arabic: 'المصروف غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can delete this expense
    if (expense.user.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to delete this expense',
          arabic: 'غير مخول لحذف هذا المصروف',
          statusCode: 403
        }
      });
    }

    // Update project budget if this expense is linked to a project
    if (expense.project) {
      const Project = require('../models/Project');
      const projectDoc = await Project.findById(expense.project);
      if (projectDoc) {
        // Remove the expense amount from project budget
        projectDoc.budget.spent = Math.max(0, projectDoc.budget.spent - expense.amount);
        projectDoc.budget.remaining = projectDoc.budget.total - projectDoc.budget.spent;
        await projectDoc.save();
      }
    }

    // Soft delete by setting status to deleted
    expense.status = 'deleted';
    await expense.save();

    res.json({
      success: true,
      message: 'Expense deleted successfully',
      arabic: 'تم حذف المصروف بنجاح'
    });
  } catch (error) {
    console.error('Delete expense error:', error);
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

// @desc    Get expense statistics
// @route   GET /api/expenses/stats/summary
// @access  Private
router.get('/stats/summary', protect, checkViewPermission, async (req, res) => {
  try {
    // Build query - supervisors can view expenses for the user they're supervising
    const userId = req.isSupervisor ? req.user._id : req.user.id;

    // Build match query with filters (same as expenses list endpoint)
    const matchQuery = {
      user: new mongoose.Types.ObjectId(userId),
      status: 'active'
    };

    // Filter by category
    if (req.query.category) {
      matchQuery.category = new RegExp(req.query.category, 'i');
    }

    // Filter by date range (startDate/endDate take precedence over year/month)
    if (req.query.startDate || req.query.endDate) {
      matchQuery.date = {};
      if (req.query.startDate) {
        matchQuery.date.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        matchQuery.date.$lte = new Date(req.query.endDate);
      }
    } else if (req.query.year || req.query.month) {
      // Use year/month if provided
      const currentYear = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
      const currentMonth = req.query.month ? parseInt(req.query.month) : new Date().getMonth() + 1;
      const startDate = new Date(currentYear, currentMonth - 1, 1);
      const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);
      matchQuery.date = { $gte: startDate, $lte: endDate };
    }
    // If no date filters provided, don't add date filter (shows all expenses)

    // Add search filter to match query if provided
    if (req.query.search) {
      matchQuery.$or = [
        { description: new RegExp(req.query.search, 'i') },
        { category: new RegExp(req.query.search, 'i') }
      ];
    }

    // Build aggregation pipeline
    const pipeline = [
      {
        $match: matchQuery
      }
    ];

    // Add grouping to calculate stats
    pipeline.push({
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        averageAmount: { $avg: '$amount' }
      }
    });

    const totalExpenses = await Expense.aggregate(pipeline);

    // Get monthly summary for backward compatibility (only if year/month provided)
    let monthlySummary = null;
    if (req.query.year || req.query.month) {
      const currentYear = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
      const currentMonth = req.query.month ? parseInt(req.query.month) : new Date().getMonth() + 1;
      monthlySummary = await Expense.getMonthlySummary(userId, currentYear, currentMonth);
    }

    res.json({
      success: true,
      data: {
        ...(monthlySummary && { monthlySummary }),
        totalExpenses: totalExpenses[0] || { totalAmount: 0, count: 0, averageAmount: 0 }
      }
    });
  } catch (error) {
    console.error('Get expense stats error:', error);
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

// @desc    Approve expense
// @route   PUT /api/expenses/:id/approve
// @access  Private (Approvers only)
router.put('/:id/approve', protect, checkApprovalPermission, [
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Expense not found',
          arabic: 'المصروف غير موجود',
          statusCode: 404
        }
      });
    }

    if (expense.approval.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Expense is not pending approval',
          arabic: 'المصروف ليس في انتظار الموافقة',
          statusCode: 400
        }
      });
    }

    const { notes } = req.body;
    await expense.approve(req.user.id, notes);

    res.json({
      success: true,
      message: 'Expense approved successfully',
      arabic: 'تم الموافقة على المصروف بنجاح',
      data: { expense }
    });
  } catch (error) {
    console.error('Approve expense error:', error);
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

// @desc    Reject expense
// @route   PUT /api/expenses/:id/reject
// @access  Private (Approvers only)
router.put('/:id/reject', protect, checkApprovalPermission, [
  body('reason')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Rejection reason is required and cannot exceed 500 characters')
], async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Expense not found',
          arabic: 'المصروف غير موجود',
          statusCode: 404
        }
      });
    }

    if (expense.approval.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Expense is not pending approval',
          arabic: 'المصروف ليس في انتظار الموافقة',
          statusCode: 400
        }
      });
    }

    const { reason } = req.body;
    await expense.reject(req.user.id, reason);

    res.json({
      success: true,
      message: 'Expense rejected successfully',
      arabic: 'تم رفض المصروف بنجاح',
      data: { expense }
    });
  } catch (error) {
    console.error('Reject expense error:', error);
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

// @desc    Bulk operations on expenses
// @route   POST /api/expenses/bulk
// @access  Private
router.post('/bulk', protect, checkCreatePermission, [
  body('operation')
    .isIn(['delete', 'update_category', 'update_type', 'export'])
    .withMessage('Operation must be delete, update_category, update_type, or export'),
  body('expenseIds')
    .isArray({ min: 1 })
    .withMessage('Expense IDs array is required'),
  body('expenseIds.*')
    .isMongoId()
    .withMessage('Invalid expense ID format')
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

    const { operation, expenseIds, data } = req.body;

    // Verify all expenses belong to the user
    const expenses = await Expense.find({
      _id: { $in: expenseIds },
      user: req.user.id
    });

    if (expenses.length !== expenseIds.length) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Some expenses not found or not authorized',
          arabic: 'بعض المصروفات غير موجودة أو غير مخول',
          statusCode: 400
        }
      });
    }

    let result;
    switch (operation) {
      case 'delete':
        result = await Expense.updateMany(
          { _id: { $in: expenseIds } },
          { status: 'deleted' }
        );
        break;

      case 'update_category':
        if (!data.category) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Category is required for update_category operation',
              arabic: 'الفئة مطلوبة لعملية تحديث الفئة',
              statusCode: 400
            }
          });
        }
        result = await Expense.updateMany(
          { _id: { $in: expenseIds } },
          { category: data.category }
        );
        break;

      case 'update_type':
        if (!data.type || !['personal', 'business', 'project'].includes(data.type)) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Valid type is required for update_type operation',
              arabic: 'نوع صحيح مطلوب لعملية تحديث النوع',
              statusCode: 400
            }
          });
        }
        result = await Expense.updateMany(
          { _id: { $in: expenseIds } },
          { type: data.type }
        );
        break;

      case 'export':
        // Return expenses data for export
        const exportData = await Expense.find({
          _id: { $in: expenseIds }
        }).populate('project', 'name').populate('company', 'name');

        return res.json({
          success: true,
          data: {
            expenses: exportData,
            count: exportData.length
          }
        });
    }

    res.json({
      success: true,
      message: `Bulk ${operation} completed successfully`,
      arabic: `تم إكمال ${operation} المجمع بنجاح`,
      data: {
        modifiedCount: result.modifiedCount,
        operation
      }
    });
  } catch (error) {
    console.error('Bulk operation error:', error);
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

// Helper function to get predefined categories
function getPredefinedCategories(accountType, type) {
  const baseCategories = [
    'طعام',
    'مواصلات',
    'تسوق',
    'ترفيه',
    'صحة وطب',
    'تعليم',
    'أخرى'
  ];

  const businessCategories = [
    'مكتب ومعدات',
    'سفر عمل',
    'اتصالات',
    'تسويق وإعلان',
    'تدريب',
    'برمجيات',
    'خدمات قانونية',
    'محاسبة',
    'أخرى'
  ];

  const projectCategories = [
    'مواد خام',
    'عمالة',
    'معدات',
    'نقل',
    'تصاريح',
    'تأمين',
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
