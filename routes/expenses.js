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
const { cacheService, CACHE_TTL } = require('../utils/cache');
const logger = require('../utils/logger');

const router = express.Router();

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
router.get('/', protect, checkViewPermission, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Cap at 100
    const skip = (page - 1) * limit;

    // Build query - supervisors can view expenses for the user they're supervising
    // Optimization: Ensure userId is ObjectId for consistent query performance
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
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { description: searchRegex },
        { category: searchRegex },
        { subcategory: searchRegex },
        { tags: { $in: [searchRegex] } },
        { location: searchRegex },
        { notes: searchRegex }
      ];
    }

    // Generate cache key for this query
    const cacheKey = cacheService.generateKey('expenses', {
      userId: userId.toString(),
      page,
      limit,
      ...req.query
    });

    // Try to get from cache (only for non-search queries)
    if (!req.query.search) {
      const cached = cacheService.get(cacheKey);
      if (cached) {
        logger.cache(cacheKey, true);
        return res.json(cached);
      }
      logger.cache(cacheKey, false);
    }

    // Use Promise.all for parallel execution of query and count
    const [expenses, total] = await Promise.all([
      Expense.find(query)
        .select('-aiProcessing.originalText -notes -location.coordinates') // Exclude heavy fields
        .populate('project', 'name')
        .populate('company', 'name')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(), // Use lean() for better performance
      Expense.countDocuments(query)
    ]);

    const response = {
      success: true,
      data: {
        expenses,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    };

    // Cache the response (only for non-search queries)
    if (!req.query.search) {
      cacheService.set(cacheKey, response, CACHE_TTL.SHORT);
    }

    res.json(response);
  } catch (error) {
    logger.error('Get expenses error:', { error: error.message });
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

// @desc    Get expense categories
// @route   GET /api/expenses/categories
// @access  Private
router.get('/categories', protect, checkViewPermission, async (req, res) => {
  try {
    const { type } = req.query;
    const userId = req.user.id;

    // Optimization: Add caching for categories to speed up dropdowns
    const cacheKey = cacheService.generateKey('expense-categories', {
      userId,
      type: type || 'all'
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Get categories from user's expenses
    const matchQuery = {
      user: new mongoose.Types.ObjectId(userId),
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

    const response = {
      success: true,
      data: {
        categories,
        predefinedCategories
      }
    };

    // Cache categories for a reasonable time (e.g., 5 mins)
    cacheService.set(cacheKey, response, CACHE_TTL.MEDIUM);

    res.json(response);
  } catch (error) {
    logger.error('Get categories error:', { error: error.message });
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
    const matchStage = {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate },
        status: 'active'
      }
    };

    // Optimization: Run all aggregations in parallel using Promise.all
    const [categoryBreakdown, monthlyTrend, paymentMethodBreakdown, totalSummary] = await Promise.all([
      // 1. Category Breakdown
      Expense.aggregate([
        matchStage,
        {
          $group: {
            _id: '$category',
            amount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { amount: -1 } }
      ]),

      // 2. Monthly Trend (only if period is year)
      period === 'year' ? Expense.aggregate([
        matchStage,
        {
          $group: {
            _id: { $month: '$date' },
            amount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]) : Promise.resolve([]),

      // 3. Payment Method Breakdown
      Expense.aggregate([
        matchStage,
        {
          $group: {
            _id: '$paymentMethod',
            amount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 4. Total Summary
      Expense.aggregate([
        matchStage,
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
      ])
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
    logger.error('Get analytics error:', { error: error.message });
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
    // Optimization: Use lean() for read-only operation
    const expense = await Expense.findById(req.params.id)
      .populate('project', 'name')
      .populate('company', 'name')
      .lean();

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
    logger.error('Get expense error:', { error: error.message });
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

    // Optimization: Run side-effects (updates/workflow) in parallel
    const sideEffects = [];
    let approval = null;

    // 1. Populate expense (needed for response)
    sideEffects.push(expense.populate([
      { path: 'project', select: 'name' },
      { path: 'company', select: 'name' }
    ]));

    // 2. Increment voice input counter
    if (aiProcessing && aiProcessing.isVoiceInput) {
      const User = require('../models/User');
      sideEffects.push(
        User.findById(req.user.id)
          .then(user => user && user.incrementUsage('voiceInput'))
          .catch(err => logger.error('Voice usage increment failed', { error: err.message }))
      );
    }

    // 3. Update project budget
    if (type === 'project' && project) {
      const Project = require('../models/Project');
      sideEffects.push(
        Project.findById(project)
          .then(projectDoc => projectDoc && projectDoc.addExpense(expense._id, amount, category, req.user.id))
          .catch(err => logger.error('Project budget update failed', { error: err.message }))
      );
    }

    // 4. Create approval workflow
    if (type === 'business' && company) {
      const Approval = require('../models/Approval');
      const workflow = amount > 1000 ? 'multi_level' : 'single_approval';
      // We push this to promise array, but also assign result to 'approval' var
      sideEffects.push(
        Approval.createExpenseApproval(expense, company, req.user.id, workflow)
          .then(res => { approval = res; })
          .catch(err => logger.error('Approval creation failed', { error: err.message }))
      );
    }

    // Await all side effects
    await Promise.all(sideEffects);

    const responseData = { expense };
    if (approval) {
      responseData.approval = approval;
    }

    // Invalidate user's expense cache
    cacheService.invalidateUser(req.user.id, 'expenses');
    // Also invalidate categories cache in case a new category was created
    cacheService.invalidateUser(req.user.id, 'expense-categories');

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
    logger.error('Create expense error:', { error: error.message });
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', arabic: 'فشل التحقق من البيانات', details: errors.array(), statusCode: 400 }
      });
    }

    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        error: { message: 'Expense not found', arabic: 'المصروف غير موجود', statusCode: 404 }
      });
    }

    if (expense.user.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Not authorized to edit this expense', arabic: 'غير مخول لتعديل هذا المصروف', statusCode: 403 }
      });
    }

    const {
      amount, category, subcategory, description,
      paymentMethod, date, tags, location, notes, aiProcessing
    } = req.body;

    const oldAmount = expense.amount;
    const cleanedDescription = description !== undefined
      ? (description.trim() ? description.trim() : undefined)
      : undefined;

    // Optimization: Update expense and project budget in parallel
    const updatePromises = [];

    // 1. Update Expense
    const expenseUpdatePromise = Expense.findByIdAndUpdate(
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
    updatePromises.push(expenseUpdatePromise);

    // 2. Update Project Budget (if applicable and amount changed)
    if (expense.project && amount && amount !== oldAmount) {
      const Project = require('../models/Project');
      const projectUpdatePromise = Project.findById(expense.project)
        .then(projectDoc => {
          if (projectDoc) {
            // Remove old amount and add new amount
            projectDoc.budget.spent = projectDoc.budget.spent - oldAmount + amount;
            projectDoc.budget.remaining = projectDoc.budget.total - projectDoc.budget.spent;
            return projectDoc.save();
          }
        });
      updatePromises.push(projectUpdatePromise);
    }

    // Execute parallel updates
    const [updatedExpense] = await Promise.all(updatePromises);

    // Invalidate user's expense cache
    cacheService.invalidateUser(req.user.id, 'expenses');
    if (category) cacheService.invalidateUser(req.user.id, 'expense-categories');

    res.json({
      success: true,
      message: 'Expense updated successfully',
      arabic: 'تم تحديث المصروف بنجاح',
      data: { expense: updatedExpense }
    });
  } catch (error) {
    logger.error('Update expense error:', { error: error.message });
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
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
        error: { message: 'Expense not found', arabic: 'المصروف غير موجود', statusCode: 404 }
      });
    }

    if (expense.user.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Not authorized to delete this expense', arabic: 'غير مخول لحذف هذا المصروف', statusCode: 403 }
      });
    }

    // Optimization: Run delete and project budget update in parallel
    const tasks = [];

    // 1. Soft Delete
    expense.status = 'deleted';
    tasks.push(expense.save());

    // 2. Update Project Budget
    if (expense.project) {
      const Project = require('../models/Project');
      tasks.push(
        Project.findById(expense.project).then(projectDoc => {
          if (projectDoc) {
            projectDoc.budget.spent = Math.max(0, projectDoc.budget.spent - expense.amount);
            projectDoc.budget.remaining = projectDoc.budget.total - projectDoc.budget.spent;
            return projectDoc.save();
          }
        })
      );
    }

    await Promise.all(tasks);

    cacheService.invalidateUser(req.user.id, 'expenses');
    cacheService.invalidateUser(req.user.id, 'expense-categories');

    res.json({
      success: true,
      message: 'Expense deleted successfully',
      arabic: 'تم حذف المصروف بنجاح'
    });
  } catch (error) {
    logger.error('Delete expense error:', { error: error.message });
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Get expense statistics
// @route   GET /api/expenses/stats/summary
// @access  Private
router.get('/stats/summary', protect, checkViewPermission, async (req, res) => {
  try {
    const userId = req.isSupervisor ? req.user._id : req.user.id;
    const matchQuery = {
      user: new mongoose.Types.ObjectId(userId),
      status: 'active'
    };

    if (req.query.category) {
      matchQuery.category = new RegExp(req.query.category, 'i');
    }

    if (req.query.startDate || req.query.endDate) {
      matchQuery.date = {};
      if (req.query.startDate) matchQuery.date.$gte = new Date(req.query.startDate);
      if (req.query.endDate) matchQuery.date.$lte = new Date(req.query.endDate);
    } else if (req.query.year || req.query.month) {
      const currentYear = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
      const currentMonth = req.query.month ? parseInt(req.query.month) : new Date().getMonth() + 1;
      const startDate = new Date(currentYear, currentMonth - 1, 1);
      const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);
      matchQuery.date = { $gte: startDate, $lte: endDate };
    }

    if (req.query.search) {
      matchQuery.$or = [
        { description: new RegExp(req.query.search, 'i') },
        { category: new RegExp(req.query.search, 'i') }
      ];
    }

    // Optimization: Parallelize total stats and monthly summary
    const tasks = [
      Expense.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
            averageAmount: { $avg: '$amount' }
          }
        }
      ])
    ];

    if (req.query.year || req.query.month) {
      const currentYear = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
      const currentMonth = req.query.month ? parseInt(req.query.month) : new Date().getMonth() + 1;
      tasks.push(Expense.getMonthlySummary(userId, currentYear, currentMonth));
    } else {
      tasks.push(Promise.resolve(null));
    }

    const [totalExpenses, monthlySummary] = await Promise.all(tasks);

    res.json({
      success: true,
      data: {
        ...(monthlySummary && { monthlySummary }),
        totalExpenses: totalExpenses[0] || { totalAmount: 0, count: 0, averageAmount: 0 }
      }
    });
  } catch (error) {
    logger.error('Get expense stats error:', { error: error.message });
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
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
        error: { message: 'Expense not found', arabic: 'المصروف غير موجود', statusCode: 404 }
      });
    }

    if (expense.approval.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: { message: 'Expense is not pending approval', arabic: 'المصروف ليس في انتظار الموافقة', statusCode: 400 }
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
    logger.error('Approve expense error:', { error: error.message });
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
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
        error: { message: 'Expense not found', arabic: 'المصروف غير موجود', statusCode: 404 }
      });
    }

    if (expense.approval.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: { message: 'Expense is not pending approval', arabic: 'المصروف ليس في انتظار الموافقة', statusCode: 400 }
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
    logger.error('Reject expense error:', { error: error.message });
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
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
        error: { message: 'Validation failed', arabic: 'فشل في التحقق من البيانات', details: errors.array(), statusCode: 400 }
      });
    }

    const { operation, expenseIds, data } = req.body;

    // Verify all expenses belong to the user
    // Optimization: Use countDocuments for faster check if we don't need the docs for 'delete' soft delete is different though
    const expenses = await Expense.find({
      _id: { $in: expenseIds },
      user: req.user.id
    }).select('_id'); // Only select ID for validation

    if (expenses.length !== expenseIds.length) {
      return res.status(400).json({
        success: false,
        error: { message: 'Some expenses not found or not authorized', arabic: 'بعض المصروفات غير موجودة أو غير مخول', statusCode: 400 }
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
            error: { message: 'Category is required', arabic: 'الفئة مطلوبة', statusCode: 400 }
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
            error: { message: 'Valid type is required', arabic: 'نوع صحيح مطلوب', statusCode: 400 }
          });
        }
        result = await Expense.updateMany(
          { _id: { $in: expenseIds } },
          { type: data.type }
        );
        break;

      case 'export':
        const exportData = await Expense.find({
          _id: { $in: expenseIds }
        }).populate('project', 'name').populate('company', 'name').lean();

        return res.json({
          success: true,
          data: {
            expenses: exportData,
            count: exportData.length
          }
        });
    }

    cacheService.invalidateUser(req.user.id, 'expenses');
    if (operation === 'update_category') cacheService.invalidateUser(req.user.id, 'expense-categories');

    res.json({
      success: true,
      message: `Bulk ${operation} completed successfully`,
      arabic: `تم إكمال ${operation} المجمع بنجاح`,
      data: {
        modifiedCount: result ? result.modifiedCount : 0,
        operation
      }
    });
  } catch (error) {
    logger.error('Bulk operation error:', { error: error.message });
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// Helper function to get predefined categories
function getPredefinedCategories(accountType, type) {
  const baseCategories = [
    'طعام', 'مواصلات', 'تسوق', 'ترفيه', 'صحة وطب', 'تعليم', 'أخرى'
  ];

  const businessCategories = [
    'مكتب ومعدات', 'سفر عمل', 'اتصالات', 'تسويق وإعلان', 'تدريب',
    'برمجيات', 'خدمات قانونية', 'محاسبة', 'أخرى'
  ];

  const projectCategories = [
    'مواد خام', 'عمالة', 'معدات', 'نقل', 'تصاريح', 'تأمين', 'أخرى'
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