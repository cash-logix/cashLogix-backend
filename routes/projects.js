const express = require('express');
const { body, validationResult } = require('express-validator');
const Project = require('../models/Project');
const {
  protect,
  checkProjectPermission,
  checkViewPermission,
  checkEditPermission,
  checkDeletePermission
} = require('../middleware/auth');
const { requirePaidPlan, checkPlanLimits } = require('../middleware/subscription');
const { default: mongoose } = require('mongoose');

const router = express.Router();

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private
router.get('/', protect, checkViewPermission, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query based on user role
    let query = { isActive: true };

    if (req.user.role === 'individual_user') {
      // Individual users can see projects they own OR projects where they are accepted partners
      query.$or = [
        { owner: req.user.id },
        { 'partners.user': req.user.id, 'partners.status': 'accepted' }
      ];
    } else if (['partner_input', 'partner_view'].includes(req.user.role)) {
      query.$or = [
        { owner: req.user.id },
        { 'partners.user': req.user.id, 'partners.status': 'accepted' }
      ];
    } else {
      // For other roles (contractor, company_owner, etc.), show all projects they own or are partners in
      query.$or = [
        { owner: req.user.id },
        { 'partners.user': req.user.id, 'partners.status': 'accepted' }
      ];
    }

    const projects = await Project.find(query)
      .populate('owner', 'firstName lastName email')
      .populate('partners.user', 'firstName lastName email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Update budget tracking for each project
    const Expense = require('../models/Expense');
    for (let project of projects) {
      // Calculate actual spent amount from expenses
      const expenses = await Expense.find({
        project: project._id,
        status: 'active'
      });

      const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      // Update project budget
      project.budget.spent = totalSpent;
      project.budget.remaining = project.budget.total - totalSpent;

      // Calculate budget utilization percentage
      project.budgetUtilization = project.budget.total > 0
        ? (totalSpent / project.budget.total) * 100
        : 0;

      // Save the updated project to persist the budget changes
      await project.save();
    }

    const total = await Project.countDocuments(query);

    res.json({
      success: true,
      data: {
        projects,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
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
router.post('/', protect, checkProjectPermission, requirePaidPlan, checkPlanLimits('maxProjects'), [
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
      name,
      description,
      budget,
      currency,
      startDate,
      endDate,
      priority,
      categories,
      tags,
      location,
      client,
      company
    } = req.body;

    // Validate date range
    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'End date must be after start date',
          arabic: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
          statusCode: 400
        }
      });
    }

    // Create project
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
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        statusCode: 500
      }
    });
  }
});

// @desc    Invite partner to project
// @route   POST /api/projects/:id/partners
// @access  Private
router.post('/:id/partners', protect, checkProjectPermission, [
  body('email')
    .isEmail()
    .withMessage('Valid email address is required'),
  body('role')
    .isIn(['partner_input', 'partner_view'])
    .withMessage('Role must be partner_input or partner_view')
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

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can invite partners
    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to invite partners to this project',
          arabic: 'غير مخول لدعوة شركاء لهذا المشروع',
          statusCode: 403
        }
      });
    }

    const { email, role } = req.body;

    // Find user by email
    const User = require('../models/User');
    const userToInvite = await User.findOne({ email: email.toLowerCase() });

    if (!userToInvite) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found with this email address',
          arabic: 'المستخدم غير موجود بهذا البريد الإلكتروني',
          statusCode: 404
        }
      });
    }

    // Add partner
    await project.addPartner(userToInvite._id, role, req.user.id);

    // Populate and return updated project
    await project.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

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
      error: {
        message: error.message || 'Server error',
        arabic: 'خطأ في الخادم',
        statusCode: 500
      }
    });
  }
});

// @desc    Accept partner invitation
// @route   PUT /api/projects/:id/partners/accept
// @access  Private
router.put('/:id/partners/accept', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Accept invitation
    try {
      await project.acceptPartnerInvitation(req.user.id);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: error.message,
          arabic: error.message === 'Partner invitation not found' ? 'دعوة الشريك غير موجودة' : 'خطأ في قبول الدعوة',
          statusCode: 400
        }
      });
    }

    // Populate and return updated project
    await project.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

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
      error: {
        message: error.message || 'Server error',
        arabic: 'خطأ في الخادم',
        statusCode: 500
      }
    });
  }
});

// @desc    Get project statistics
// @route   GET /api/projects/stats/summary
// @access  Private
router.get('/stats/summary', protect, checkViewPermission, async (req, res) => {
  try {
    const statistics = await Project.getStatistics(req.user.id);

    res.json({
      success: true,
      data: { statistics }
    });
  } catch (error) {
    console.error('Get project stats error:', error);
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

// @desc    Search projects
// @route   GET /api/projects/search
// @access  Private
router.get('/search', protect, checkViewPermission, async (req, res) => {
  try {
    const { q, status, priority, client } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query based on user role
    let query = { isActive: true };

    if (req.user.role === 'individual_user') {
      // Individual users can see projects they own OR projects where they are accepted partners
      query.$or = [
        { owner: req.user.id },
        { 'partners.user': req.user.id, 'partners.status': 'accepted' }
      ];
    } else if (['partner_input', 'partner_view'].includes(req.user.role)) {
      query.$or = [
        { owner: req.user.id },
        { 'partners.user': req.user.id, 'partners.status': 'accepted' }
      ];
    } else {
      // For other roles (contractor, company_owner, etc.), show all projects they own or are partners in
      query.$or = [
        { owner: req.user.id },
        { 'partners.user': req.user.id, 'partners.status': 'accepted' }
      ];
    }

    // Add search filters
    if (q) {
      query.$or = [
        { name: new RegExp(q, 'i') },
        { description: new RegExp(q, 'i') },
        { tags: { $in: [new RegExp(q, 'i')] } }
      ];
    }

    if (status) {
      query.status = status;
    }

    if (priority) {
      query.priority = priority;
    }

    if (client) {
      query.client = new RegExp(client, 'i');
    }

    const projects = await Project.find(query)
      .populate('owner', 'firstName lastName email')
      .populate('partners.user', 'firstName lastName email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Update budget tracking for each project
    const Expense = require('../models/Expense');
    for (let project of projects) {
      // Calculate actual spent amount from expenses
      const expenses = await Expense.find({
        project: project._id,
        status: 'active'
      });

      const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      // Update project budget
      project.budget.spent = totalSpent;
      project.budget.remaining = project.budget.total - totalSpent;

      // Calculate budget utilization percentage
      project.budgetUtilization = project.budget.total > 0
        ? (totalSpent / project.budget.total) * 100
        : 0;

      // Save the updated project to persist the budget changes
      await project.save();
    }

    const total = await Project.countDocuments(query);

    res.json({
      success: true,
      data: {
        projects,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        },
        searchQuery: { q, status, priority, client }
      }
    });
  } catch (error) {
    console.error('Search projects error:', error);
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

// @desc    Get project by ID
// @route   GET /api/projects/:id
// @access  Private
router.get('/:id', protect, checkViewPermission, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid project ID',
          arabic: 'معرّف المشروع غير صالح',
          statusCode: 400
        }
      });
    }

    const project = await Project.findById(req.params.id)
      .populate('owner', 'firstName lastName email _id')
      .populate('partners.user', 'firstName lastName email _id')
      .populate('company', 'name');

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can view this project
    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this project',
          arabic: 'غير مخول لعرض هذا المشروع',
          statusCode: 403
        }
      });
    }

    res.json({
      success: true,
      data: { project }
    });
  } catch (error) {
    console.error('Get project error:', error);
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

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private
router.put('/:id', protect, checkEditPermission, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Project name must be less than 200 characters'),
  body('budget')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Budget must be a positive number'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
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

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this project
    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this project',
          arabic: 'غير مخول لتعديل هذا المشروع',
          statusCode: 403
        }
      });
    }

    const {
      name,
      description,
      budget,
      startDate,
      endDate,
      priority,
      categories,
      tags,
      location,
      client,
      status
    } = req.body;

    // Validate date range if both dates are provided
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'End date must be after start date',
          arabic: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
          statusCode: 400
        }
      });
    }

    // Build update data
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

    // Handle budget update
    if (budget !== undefined) {
      updateData['budget.total'] = budget;
    }

    // Update project
    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

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
      error: {
        message: 'Server error',
        arabic: 'خطأ في الخادم',
        statusCode: 500
      }
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
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can delete this project
    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to delete this project',
          arabic: 'غير مخول لحذف هذا المشروع',
          statusCode: 403
        }
      });
    }

    // Soft delete by setting isActive to false
    project.isActive = false;
    await project.save();

    res.json({
      success: true,
      message: 'Project deleted successfully',
      arabic: 'تم حذف المشروع بنجاح'
    });
  } catch (error) {
    console.error('Delete project error:', error);
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

// @desc    Remove partner from project
// @route   DELETE /api/projects/:id/partners/:partnerId
// @access  Private
router.delete('/:id/partners/:partnerId', protect, checkEditPermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this project
    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to remove partners from this project',
          arabic: 'غير مخول لإزالة شركاء من هذا المشروع',
          statusCode: 403
        }
      });
    }

    const { partnerId } = req.params;

    // Remove partner
    await project.removePartner(partnerId);

    // Populate and return updated project
    await project.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

    res.json({
      success: true,
      message: 'Partner removed successfully',
      arabic: 'تم إزالة الشريك بنجاح',
      data: { project }
    });
  } catch (error) {
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

// @desc    Reject partner invitation
// @route   PUT /api/projects/:id/partners/reject
// @access  Private
router.put('/:id/partners/reject', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Reject invitation
    await project.declinePartnerInvitation(req.user.id);

    res.json({
      success: true,
      message: 'Partner invitation rejected successfully',
      arabic: 'تم رفض دعوة الشريك بنجاح'
    });
  } catch (error) {
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

// @desc    Get project budget tracking
// @route   GET /api/projects/:id/budget
// @access  Private
router.get('/:id/budget', protect, checkViewPermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can view this project
    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this project',
          arabic: 'غير مخول لعرض هذا المشروع',
          statusCode: 403
        }
      });
    }

    // Get budget tracking data
    const budgetData = await project.getBudgetTracking();

    res.json({
      success: true,
      data: {
        project: {
          id: project._id,
          name: project.name,
          budget: project.budget
        },
        budgetTracking: budgetData
      }
    });
  } catch (error) {
    console.error('Get project budget error:', error);
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

// @desc    Get project analytics
// @route   GET /api/projects/:id/analytics
// @access  Private
router.get('/:id/analytics', protect, checkViewPermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can view this project
    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this project',
          arabic: 'غير مخول لعرض هذا المشروع',
          statusCode: 403
        }
      });
    }

    // Get project analytics
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

// @desc    Get project partners
// @route   GET /api/projects/:id/partners
// @access  Private
router.get('/:id/partners', protect, checkViewPermission, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('partners.user', 'firstName lastName email phone')
      .select('partners owner');

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can view this project
    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this project',
          arabic: 'غير مخول لعرض هذا المشروع',
          statusCode: 403
        }
      });
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

// @desc    Update partner role
// @route   PUT /api/projects/:id/partners/:partnerId
// @access  Private
router.put('/:id/partners/:partnerId', protect, checkEditPermission, [
  body('role')
    .isIn(['partner_input', 'partner_view'])
    .withMessage('Role must be partner_input or partner_view')
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

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this project
    if (!project.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to update partners in this project',
          arabic: 'غير مخول لتحديث شركاء في هذا المشروع',
          statusCode: 403
        }
      });
    }

    const { partnerId } = req.params;
    const { role } = req.body;

    // Find and update the partner's role
    const partner = project.partners.find(p => p._id.toString() === partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Partner not found',
          arabic: 'الشريك غير موجود',
          statusCode: 404
        }
      });
    }

    // Update partner role and permissions
    partner.role = role;
    partner.permissions = {
      canAddExpenses: role === 'partner_input',
      canAddRevenues: role === 'partner_input',
      canEditProject: false,
      canInvitePartners: false
    };

    // Save the project
    await project.save();

    // Populate and return updated project
    await project.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'partners.user', select: 'firstName lastName email' },
      { path: 'company', select: 'name' }
    ]);

    res.json({
      success: true,
      message: 'Partner role updated successfully',
      arabic: 'تم تحديث دور الشريك بنجاح',
      data: { project }
    });
  } catch (error) {
    console.error('Update partner role error:', error);
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

// @desc    Get projects by status
// @route   GET /api/projects/status/:status
// @access  Private
router.get('/status/:status', protect, checkViewPermission, async (req, res) => {
  try {
    const { status } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Validate status
    const validStatuses = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid project status',
          arabic: 'حالة المشروع غير صحيحة',
          statusCode: 400
        }
      });
    }

    // Build query based on user role
    let query = { isActive: true, status };

    if (req.user.role === 'individual_user') {
      // Individual users can see projects they own OR projects where they are accepted partners
      query.$or = [
        { owner: req.user.id },
        { 'partners.user': req.user.id, 'partners.status': 'accepted' }
      ];
    } else if (['partner_input', 'partner_view'].includes(req.user.role)) {
      query.$or = [
        { owner: req.user.id },
        { 'partners.user': req.user.id, 'partners.status': 'accepted' }
      ];
    } else {
      // For other roles (contractor, company_owner, etc.), show all projects they own or are partners in
      query.$or = [
        { owner: req.user.id },
        { 'partners.user': req.user.id, 'partners.status': 'accepted' }
      ];
    }

    const projects = await Project.find(query)
      .populate('owner', 'firstName lastName email')
      .populate('partners.user', 'firstName lastName email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Update budget tracking for each project
    const Expense = require('../models/Expense');
    for (let project of projects) {
      // Calculate actual spent amount from expenses
      const expenses = await Expense.find({
        project: project._id,
        status: 'active'
      });

      const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      // Update project budget
      project.budget.spent = totalSpent;
      project.budget.remaining = project.budget.total - totalSpent;

      // Calculate budget utilization percentage
      project.budgetUtilization = project.budget.total > 0
        ? (totalSpent / project.budget.total) * 100
        : 0;

      // Save the updated project to persist the budget changes
      await project.save();
    }

    const total = await Project.countDocuments(query);

    res.json({
      success: true,
      data: {
        projects,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get projects by status error:', error);
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

// @desc    Get project expenses
// @route   GET /api/projects/:id/expenses
// @access  Private
router.get('/:id/expenses', protect, checkViewPermission, async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid project ID',
          arabic: 'معرّف المشروع غير صالح',
          statusCode: 400
        }
      });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can view this project
    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this project',
          arabic: 'غير مخول لعرض هذا المشروع',
          statusCode: 403
        }
      });
    }

    // Get expenses for this project
    const Expense = require('../models/Expense');
    const expenses = await Expense.find({
      project: id,
      status: 'active'
    })
      .populate('user', 'firstName lastName email')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Expense.countDocuments({ project: id, status: 'active' });

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
    console.error('Get project expenses error:', error);
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

// @desc    Get project revenues
// @route   GET /api/projects/:id/revenues
// @access  Private
router.get('/:id/revenues', protect, checkViewPermission, async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid project ID',
          arabic: 'معرّف المشروع غير صالح',
          statusCode: 400
        }
      });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Project not found',
          arabic: 'المشروع غير موجود',
          statusCode: 404
        }
      });
    }

    // Check if user can view this project
    if (!project.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this project',
          arabic: 'غير مخول لعرض هذا المشروع',
          statusCode: 403
        }
      });
    }

    // Get revenues for this project
    const Revenue = require('../models/Revenue');
    const revenues = await Revenue.find({
      project: id,
      status: 'active'
    })
      .populate('user', 'firstName lastName email')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Revenue.countDocuments({ project: id, status: 'active' });

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
    console.error('Get project revenues error:', error);
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
