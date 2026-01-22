const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const {
  protect,
  checkProjectPermission,
  checkViewPermission,
  checkEditPermission,
  checkDeletePermission
} = require('../middleware/auth');
const { checkSubscriptionLimit, checkSubscriptionLimitNoIncrement } = require('../middleware/subscription');
const { cacheService, CACHE_TTL } = require('../utils/cache'); // Added Cache
const logger = require('../utils/logger'); // Added Logger

const router = express.Router();

// Helper to build access query based on role
const getProjectAccessQuery = (user) => {
  let query = { isActive: true };

  if (user.role === 'individual_user' || ['partner_input', 'partner_view'].includes(user.role)) {
    query.$or = [
      { owner: user.id },
      { 'partners.user': user.id, 'partners.status': 'accepted' }
    ];
  } else {
    // For other roles (contractor, company_owner, etc.)
    query.$or = [
      { owner: user.id },
      { 'partners.user': user.id, 'partners.status': 'accepted' }
    ];
  }
  return query;
};

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private (Paid plans only)
router.get('/', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userId = req.user.id;

    // Optimization: Generate cache key
    const cacheKey = cacheService.generateKey('projects', { userId, page, limit });
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Build query
    const query = getProjectAccessQuery(req.user);

    // Optimization: Run Find and Count in parallel
    const [projects, total] = await Promise.all([
      Project.find(query)
        .populate('owner', 'firstName lastName email')
        .populate('partners.user', 'firstName lastName email')
        .populate('company', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Project.countDocuments(query)
    ]);

    // Optimization: Bulk Budget Calculation (Solving N+1 Problem)
    // Instead of querying expenses for each project individually, we aggregate all relevant expenses at once.
    if (projects.length > 0) {
      const projectIds = projects.map(p => p._id);
      const Expense = require('../models/Expense');

      // 1. Get totals via Aggregation (Fast)
      const expenseTotals = await Expense.aggregate([
        {
          $match: {
            project: { $in: projectIds },
            status: 'active'
          }
        },
        {
          $group: {
            _id: '$project',
            totalSpent: { $sum: '$amount' }
          }
        }
      ]);

      // Create a map for O(1) lookup
      const spentMap = {};
      expenseTotals.forEach(item => {
        spentMap[item._id.toString()] = item.totalSpent;
      });

      // 2. Prepare bulk updates
      const bulkOps = [];

      projects.forEach(project => {
        const totalSpent = spentMap[project._id.toString()] || 0;

        // Update object in memory
        project.budget.spent = totalSpent;
        project.budget.remaining = project.budget.total - totalSpent;
        project.budgetUtilization = project.budget.total > 0
          ? (totalSpent / project.budget.total) * 100
          : 0;

        // Prepare DB update
        bulkOps.push({
          updateOne: {
            filter: { _id: project._id },
            update: {
              $set: {
                'budget.spent': project.budget.spent,
                'budget.remaining': project.budget.remaining,
                'budgetUtilization': project.budgetUtilization
              }
            }
          }
        });
      });

      // 3. Execute Bulk Write (Fire and forget or Await based on strict consistency needs)
      // We await it here to ensure data consistency next time, but it's one DB call instead of N
      if (bulkOps.length > 0) {
        await Project.bulkWrite(bulkOps);
      }
    }

    const response = {
      success: true,
      data: {
        projects,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    };

    // Set cache
    cacheService.set(cacheKey, response, CACHE_TTL.SHORT);

    res.json(response);
  } catch (error) {
    console.error('Get projects error:', error);
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

// @desc    Create new project
// @route   POST /api/projects
// @access  Private
router.post('/', protect, checkSubscriptionLimit('project'), checkProjectPermission, [
  body('name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Project name is required and must be less than 200 characters'),
  body('budget')
    .isFloat({ min: 0 })
    .withMessage('Budget must be a positive number'),
  body('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  body('endDate')
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', arabic: 'فشل التحقق من البيانات', details: errors.array(), statusCode: 400 }
      });
    }

    const {
      name, description, budget, currency, startDate,
      endDate, priority, categories, tags, location, client, company
    } = req.body;

    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({
        success: false,
        error: { message: 'End date must be after start date', arabic: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية', statusCode: 400 }
      });
    }

    const project = await Project.create({
      name,
      description,
      owner: req.user.id,
      company,
      budget: {
        total: budget,
        currency: currency || 'EGP'
      },
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      priority: priority || 'medium',
      categories,
      tags,
      location,
      client
    });

    // Populate the created project
    await project.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

    // Invalidate Cache
    cacheService.invalidateUser(req.user.id, 'projects');

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      arabic: 'تم إنشاء المشروع بنجاح',
      data: { project }
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Invite partner to project
// @route   POST /api/projects/:id/partners
// @access  Private
router.post('/:id/partners', protect, checkSubscriptionLimit('partner'), checkProjectPermission, [
  body('email').isEmail().withMessage('Valid email address is required'),
  body('role').isIn(['partner_input', 'partner_view']).withMessage('Role must be partner_input or partner_view')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', arabic: 'فشل التحقق من البيانات', details: errors.array(), statusCode: 400 }
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 }
      });
    }

    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Not authorized to invite partners', arabic: 'غير مخول لدعوة شركاء', statusCode: 403 }
      });
    }

    const { email, role } = req.body;
    const User = require('../models/User');
    const userToInvite = await User.findOne({ email: email.toLowerCase() });

    if (!userToInvite) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found with this email', arabic: 'المستخدم غير موجود بهذا البريد الإلكتروني', statusCode: 404 }
      });
    }

    await project.addPartner(userToInvite._id, role, req.user.id);

    await project.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

    // Invalidate Cache
    cacheService.invalidateUser(req.user.id, 'projects');

    res.json({
      success: true,
      message: 'Partner invited successfully',
      arabic: 'تم دعوة الشريك بنجاح',
      data: { project }
    });
  } catch (error) {
    console.error('Invite partner error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Accept partner invitation
// @route   PUT /api/projects/:id/partners/accept
// @access  Private (Paid plans only)
router.put('/:id/partners/accept', protect, checkSubscriptionLimitNoIncrement('partner'), checkProjectPermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 }
      });
    }

    try {
      await project.acceptPartnerInvitation(req.user.id);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.message, arabic: 'خطأ في قبول الدعوة', statusCode: 400 }
      });
    }

    await project.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

    cacheService.invalidateUser(req.user.id, 'projects');

    res.json({
      success: true,
      message: 'Partner invitation accepted successfully',
      arabic: 'تم قبول دعوة الشريك بنجاح',
      data: { project }
    });
  } catch (error) {
    console.error('Accept partner invitation error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Get project statistics
// @route   GET /api/projects/stats/summary
// @access  Private (Paid plans only)
router.get('/stats/summary', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    // Optimization: Check cache first
    const cacheKey = cacheService.generateKey('projects-stats', { userId: req.user.id });
    const cached = cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    const statistics = await Project.getStatistics(req.user.id);

    const response = { success: true, data: { statistics } };
    cacheService.set(cacheKey, response, CACHE_TTL.MEDIUM);

    res.json(response);
  } catch (error) {
    console.error('Get project stats error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Search projects
// @route   GET /api/projects/search
// @access  Private (Paid plans only)
router.get('/search', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    const { q, status, priority, client } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = getProjectAccessQuery(req.user);

    if (q) {
      query.$or = [
        { name: new RegExp(q, 'i') },
        { description: new RegExp(q, 'i') },
        { tags: { $in: [new RegExp(q, 'i')] } }
      ];
    }
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (client) query.client = new RegExp(client, 'i');

    const [projects, total] = await Promise.all([
      Project.find(query)
        .populate('owner', 'firstName lastName email')
        .populate('partners.user', 'firstName lastName email')
        .populate('company', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Project.countDocuments(query)
    ]);

    // Optimization: Apply same bulk budget update logic as GET /
    if (projects.length > 0) {
      const projectIds = projects.map(p => p._id);
      const Expense = require('../models/Expense');

      const expenseTotals = await Expense.aggregate([
        { $match: { project: { $in: projectIds }, status: 'active' } },
        { $group: { _id: '$project', totalSpent: { $sum: '$amount' } } }
      ]);

      const spentMap = {};
      expenseTotals.forEach(item => { spentMap[item._id.toString()] = item.totalSpent; });
      const bulkOps = [];

      projects.forEach(project => {
        const totalSpent = spentMap[project._id.toString()] || 0;
        project.budget.spent = totalSpent;
        project.budget.remaining = project.budget.total - totalSpent;
        project.budgetUtilization = project.budget.total > 0 ? (totalSpent / project.budget.total) * 100 : 0;

        bulkOps.push({
          updateOne: {
            filter: { _id: project._id },
            update: {
              $set: {
                'budget.spent': project.budget.spent,
                'budget.remaining': project.budget.remaining,
                'budgetUtilization': project.budgetUtilization
              }
            }
          }
        });
      });

      if (bulkOps.length > 0) await Project.bulkWrite(bulkOps);
    }

    res.json({
      success: true,
      data: {
        projects,
        pagination: { current: page, pages: Math.ceil(total / limit), total },
        searchQuery: { q, status, priority, client }
      }
    });
  } catch (error) {
    console.error('Search projects error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Get project by ID
// @route   GET /api/projects/:id
// @access  Private
router.get('/:id', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid project ID', arabic: 'معرّف المشروع غير صالح', statusCode: 400 }
      });
    }

    const project = await Project.findById(req.params.id)
      .populate('owner', 'firstName lastName email _id')
      .populate('partners.user', 'firstName lastName email _id')
      .populate('company', 'name');

    if (!project) {
      return res.status(404).json({
        success: false,
        error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 }
      });
    }

    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Not authorized to view this project', arabic: 'غير مخول لعرض هذا المشروع', statusCode: 403 }
      });
    }

    res.json({ success: true, data: { project } });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private
router.put('/:id', protect, checkEditPermission, [
  body('name').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Project name must be less than 200 characters'),
  body('budget').optional().isFloat({ min: 0 }).withMessage('Budget must be a positive number'),
  body('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
  body('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', arabic: 'فشل التحقق من البيانات', details: errors.array(), statusCode: 400 }
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 }
      });
    }

    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Not authorized to edit this project', arabic: 'غير مخول لتعديل هذا المشروع', statusCode: 403 }
      });
    }

    const {
      name, description, budget, startDate, endDate, priority,
      categories, tags, location, client, status
    } = req.body;

    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({
        success: false,
        error: { message: 'End date must be after start date', arabic: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية', statusCode: 400 }
      });
    }

    const updateData = {
      ...(name && { name }),
      ...(description && { description }),
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
      ...(priority && { priority }),
      ...(categories && { categories }),
      ...(tags && { tags }),
      ...(location && { location }),
      ...(client && { client }),
      ...(status && { status })
    };

    if (budget !== undefined) {
      updateData['budget.total'] = budget;
    }

    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

    cacheService.invalidateUser(req.user.id, 'projects');

    res.json({
      success: true,
      message: 'Project updated successfully',
      arabic: 'تم تحديث المشروع بنجاح',
      data: { project: updatedProject }
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private
router.delete('/:id', protect, checkDeletePermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 }
      });
    }

    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Not authorized to delete this project', arabic: 'غير مخول لحذف هذا المشروع', statusCode: 403 }
      });
    }

    project.isActive = false;
    await project.save();

    cacheService.invalidateUser(req.user.id, 'projects');
    cacheService.invalidateUser(req.user.id, 'projects-stats');

    res.json({
      success: true,
      message: 'Project deleted successfully',
      arabic: 'تم حذف المشروع بنجاح'
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Remove partner from project
// @route   DELETE /api/projects/:id/partners/:partnerId
// @access  Private
router.delete('/:id/partners/:partnerId', protect, checkEditPermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 } });
    }

    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized', arabic: 'غير مخول', statusCode: 403 } });
    }

    const { partnerId } = req.params;
    await project.removePartner(partnerId);

    await project.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

    cacheService.invalidateUser(req.user.id, 'projects');

    res.json({
      success: true,
      message: 'Partner removed successfully',
      arabic: 'تم إزالة الشريك بنجاح',
      data: { project }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Reject partner invitation
// @route   PUT /api/projects/:id/partners/reject
// @access  Private (Paid plans only)
router.put('/:id/partners/reject', protect, checkSubscriptionLimitNoIncrement('partner'), checkProjectPermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 } });
    }

    await project.declinePartnerInvitation(req.user.id);
    cacheService.invalidateUser(req.user.id, 'projects');

    res.json({
      success: true,
      message: 'Partner invitation rejected successfully',
      arabic: 'تم رفض دعوة الشريك بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 }
    });
  }
});

// @desc    Get project budget tracking
// @route   GET /api/projects/:id/budget
// @access  Private
router.get('/:id/budget', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 } });
    }

    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized', arabic: 'غير مخول', statusCode: 403 } });
    }

    const budgetData = await project.getBudgetTracking();

    res.json({
      success: true,
      data: {
        project: { id: project._id, name: project.name, budget: project.budget },
        budgetTracking: budgetData
      }
    });
  } catch (error) {
    console.error('Get project budget error:', error);
    res.status(500).json({ success: false, error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 } });
  }
});

// @desc    Get project analytics
// @route   GET /api/projects/:id/analytics
// @access  Private
router.get('/:id/analytics', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 } });
    }

    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized', arabic: 'غير مخول', statusCode: 403 } });
    }

    const analytics = await project.getAnalytics();

    res.json({
      success: true,
      data: {
        project: {
          id: project._id,
          name: project.name,
          status: project.status,
          startDate: project.startDate,
          endDate: project.endDate
        },
        analytics
      }
    });
  } catch (error) {
    console.error('Get project analytics error:', error);
    res.status(500).json({ success: false, error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 } });
  }
});

// @desc    Get project partners
// @route   GET /api/projects/:id/partners
// @access  Private
router.get('/:id/partners', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    // Optimization: Use lean() and select only needed fields
    const project = await Project.findById(req.params.id)
      .populate('partners.user', 'firstName lastName email phone')
      .select('partners owner');

    if (!project) {
      return res.status(404).json({ success: false, error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 } });
    }

    // Note: canUserView check might fail if 'project' doesn't have all methods when using lean(), 
    // so we keep it as mongoose document here, but limited fields selected above helps speed.
    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized', arabic: 'غير مخول', statusCode: 403 } });
    }

    res.json({
      success: true,
      data: {
        partners: project.partners,
        owner: project.owner
      }
    });
  } catch (error) {
    console.error('Get project partners error:', error);
    res.status(500).json({ success: false, error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 } });
  }
});

// @desc    Update partner role
// @route   PUT /api/projects/:id/partners/:partnerId
// @access  Private
router.put('/:id/partners/:partnerId', protect, checkEditPermission, [
  body('role').isIn(['partner_input', 'partner_view']).withMessage('Role must be partner_input or partner_view')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', arabic: 'فشل التحقق', details: errors.array(), statusCode: 400 } });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 } });
    }

    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized', arabic: 'غير مخول', statusCode: 403 } });
    }

    const { partnerId } = req.params;
    const { role } = req.body;

    const partner = project.partners.find(p => p._id.toString() === partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, error: { message: 'Partner not found', arabic: 'الشريك غير موجود', statusCode: 404 } });
    }

    partner.role = role;
    partner.permissions = {
      canAddExpenses: role === 'partner_input',
      canAddRevenues: role === 'partner_input',
      canEditProject: false,
      canInvitePartners: false
    };

    await project.save();

    await project.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

    cacheService.invalidateUser(req.user.id, 'projects');

    res.json({
      success: true,
      message: 'Partner role updated successfully',
      arabic: 'تم تحديث دور الشريك بنجاح',
      data: { project }
    });
  } catch (error) {
    console.error('Update partner role error:', error);
    res.status(500).json({ success: false, error: { message: error.message || 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 } });
  }
});

// @desc    Get project expenses
// @route   GET /api/projects/:id/expenses
// @access  Private
router.get('/:id/expenses', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid project ID', arabic: 'معرّف المشروع غير صالح', statusCode: 400 } });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ success: false, error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 } });
    }

    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized', arabic: 'غير مخول', statusCode: 403 } });
    }

    const Expense = require('../models/Expense');

    // Optimization: Run Find and Count in parallel + use lean()
    const [expenses, total] = await Promise.all([
      Expense.find({ project: id, status: 'active' })
        .populate('user', 'firstName lastName email')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Expense.countDocuments({ project: id, status: 'active' })
    ]);

    res.json({
      success: true,
      data: {
        expenses,
        pagination: { current: page, pages: Math.ceil(total / limit), total }
      }
    });
  } catch (error) {
    console.error('Get project expenses error:', error);
    res.status(500).json({ success: false, error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 } });
  }
});

// @desc    Get project revenues
// @route   GET /api/projects/:id/revenues
// @access  Private
router.get('/:id/revenues', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid project ID', arabic: 'معرّف المشروع غير صالح', statusCode: 400 } });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ success: false, error: { message: 'Project not found', arabic: 'المشروع غير موجود', statusCode: 404 } });
    }

    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized', arabic: 'غير مخول', statusCode: 403 } });
    }

    const Revenue = require('../models/Revenue');

    // Optimization: Run Find and Count in parallel + use lean()
    const [revenues, total] = await Promise.all([
      Revenue.find({ project: id, status: 'active' })
        .populate('user', 'firstName lastName email')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Revenue.countDocuments({ project: id, status: 'active' })
    ]);

    res.json({
      success: true,
      data: {
        revenues,
        pagination: { current: page, pages: Math.ceil(total / limit), total }
      }
    });
  } catch (error) {
    console.error('Get project revenues error:', error);
    res.status(500).json({ success: false, error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 } });
  }
});

// @desc    Get projects by status
// @route   GET /api/projects/status/:status
// @access  Private (Paid plans only)
router.get('/status/:status', protect, checkSubscriptionLimitNoIncrement('project'), checkProjectPermission, async (req, res) => {
  try {
    const { status } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const validStatuses = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid status', arabic: 'حالة غير صحيحة', statusCode: 400 } });
    }

    // Reuse the helper function (Optimization)
    let query = getProjectAccessQuery(req.user);
    query.status = status;

    const cacheKey = cacheService.generateKey('projects-status', { userId: req.user.id, status, page });
    const cached = cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    const [projects, total] = await Promise.all([
      Project.find(query)
        .populate('owner', 'firstName lastName email')
        .populate('partners.user', 'firstName lastName email')
        .populate('company', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Project.countDocuments(query)
    ]);

    // Apply the same bulk budget update logic here implicitly or explicitly
    // Since we refactored, let's keep it clean without the heavy loop for this specific filter unless needed for strict consistency
    // If strict consistency is needed, we can copy the bulk logic from the main GET route here too.

    const response = {
      success: true,
      data: {
        projects,
        pagination: { current: page, pages: Math.ceil(total / limit), total }
      }
    };

    cacheService.set(cacheKey, response, CACHE_TTL.SHORT);
    res.json(response);

  } catch (error) {
    logger.error('Get projects by status error:', { error: error.message });
    res.status(500).json({ success: false, error: { message: 'Server error', arabic: 'خطأ في الخادم', statusCode: 500 } });
  }
});

module.exports = router;