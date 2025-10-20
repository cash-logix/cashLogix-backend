const express = require('express');
const { body, validationResult } = require('express-validator');
const Approval = require('../models/Approval');
const Company = require('../models/Company');
const Expense = require('../models/Expense');
const Project = require('../models/Project');
const {
  protect,
  checkViewPermission,
  checkEditPermission
} = require('../middleware/auth');

const router = express.Router();

// Helper function to populate approval data
const populateApprovalData = async (approval) => {
  await approval.populate([
    { path: 'requestedBy', select: 'firstName lastName email' },
    { path: 'company', select: 'name' },
    { path: 'approvalSteps.approverId', select: 'firstName lastName email' }
  ]);
};

// @desc    Get all approvals for a company
// @route   GET /api/approvals/company/:companyId
// @access  Private
router.get('/company/:companyId', protect, checkViewPermission, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { status, type, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    let query = { company: companyId };
    if (status) query.status = status;
    if (type) query.type = type;

    const approvals = await Approval.find(query)
      .populate('requestedBy', 'firstName lastName email')
      .populate('company', 'name')
      .populate('approvalSteps.approverId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Approval.countDocuments(query);

    res.json({
      success: true,
      data: {
        approvals,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get approvals error:', error);
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

// @desc    Get approvals pending user's action
// @route   GET /api/approvals/pending
// @access  Private
router.get('/pending', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find approvals where user can approve
    const approvals = await Approval.find({
      status: 'pending',
      'approvalSteps.status': 'pending'
    })
      .populate('requestedBy', 'firstName lastName email')
      .populate('company', 'name')
      .populate('approvalSteps.approverId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Filter approvals where user can take action
    const pendingApprovals = approvals.filter(approval =>
      approval.canUserApprove(userId, userRole)
    );

    res.json({
      success: true,
      data: {
        approvals: pendingApprovals
      }
    });
  } catch (error) {
    console.error('Get pending approvals error:', error);
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

// @desc    Get approval by ID
// @route   GET /api/approvals/:id
// @access  Private
router.get('/:id', protect, checkViewPermission, async (req, res) => {
  try {
    const approval = await Approval.findById(req.params.id)
      .populate('requestedBy', 'firstName lastName email')
      .populate('company', 'name')
      .populate('approvalSteps.approverId', 'firstName lastName email');

    if (!approval) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Approval not found',
          arabic: 'الموافقة غير موجودة',
          statusCode: 404
        }
      });
    }

    res.json({
      success: true,
      data: {
        approval
      }
    });
  } catch (error) {
    console.error('Get approval error:', error);
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

// @desc    Create expense approval
// @route   POST /api/approvals/expense
// @access  Private
router.post('/expense', protect, [
  body('expenseId').isMongoId().withMessage('Valid expense ID is required'),
  body('companyId').isMongoId().withMessage('Valid company ID is required'),
  body('workflow').optional().isIn(['single_approval', 'multi_level']).withMessage('Invalid workflow')
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

    const { expenseId, companyId, workflow = 'single_approval' } = req.body;

    // Get expense data
    const expense = await Expense.findById(expenseId);
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

    // Check if approval already exists
    const existingApproval = await Approval.findOne({
      entityType: 'expense',
      entityId: expenseId,
      status: 'pending'
    });

    if (existingApproval) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Approval already exists for this expense',
          arabic: 'موافقة موجودة بالفعل لهذا المصروف',
          statusCode: 400
        }
      });
    }

    // Create approval
    const approval = await Approval.createExpenseApproval(
      expense,
      companyId,
      req.user.id,
      workflow
    );

    await populateApprovalData(approval);

    res.status(201).json({
      success: true,
      message: 'Expense approval created successfully',
      arabic: 'تم إنشاء موافقة المصروف بنجاح',
      data: {
        approval
      }
    });
  } catch (error) {
    console.error('Create expense approval error:', error);
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

// @desc    Create project approval
// @route   POST /api/approvals/project
// @access  Private
router.post('/project', protect, [
  body('projectId').isMongoId().withMessage('Valid project ID is required'),
  body('companyId').isMongoId().withMessage('Valid company ID is required')
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

    const { projectId, companyId } = req.body;

    // Get project data
    const project = await Project.findById(projectId);
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

    // Check if approval already exists
    const existingApproval = await Approval.findOne({
      entityType: 'project',
      entityId: projectId,
      status: 'pending'
    });

    if (existingApproval) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Approval already exists for this project',
          arabic: 'موافقة موجودة بالفعل لهذا المشروع',
          statusCode: 400
        }
      });
    }

    // Create approval
    const approval = await Approval.createProjectApproval(
      project,
      companyId,
      req.user.id
    );

    await populateApprovalData(approval);

    res.status(201).json({
      success: true,
      message: 'Project approval created successfully',
      arabic: 'تم إنشاء موافقة المشروع بنجاح',
      data: {
        approval
      }
    });
  } catch (error) {
    console.error('Create project approval error:', error);
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

// @desc    Approve step
// @route   PUT /api/approvals/:id/approve
// @access  Private
router.put('/:id/approve', protect, [
  body('comments').optional().isLength({ max: 500 }).withMessage('Comments too long')
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

    const { comments = '' } = req.body;
    const approval = await Approval.findById(req.params.id);

    if (!approval) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Approval not found',
          arabic: 'الموافقة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can approve
    if (!approval.canUserApprove(req.user.id, req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to approve this step',
          arabic: 'غير مخول للموافقة على هذه الخطوة',
          statusCode: 403
        }
      });
    }

    // Approve the step
    await approval.approveStep(req.user.id, comments);

    await populateApprovalData(approval);

    res.json({
      success: true,
      message: 'Approval step approved successfully',
      arabic: 'تم الموافقة على الخطوة بنجاح',
      data: {
        approval
      }
    });
  } catch (error) {
    console.error('Approve step error:', error);
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

// @desc    Reject step
// @route   PUT /api/approvals/:id/reject
// @access  Private
router.put('/:id/reject', protect, [
  body('comments').isLength({ min: 1, max: 500 }).withMessage('Rejection reason is required')
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

    const { comments } = req.body;
    const approval = await Approval.findById(req.params.id);

    if (!approval) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Approval not found',
          arabic: 'الموافقة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can approve
    if (!approval.canUserApprove(req.user.id, req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to reject this step',
          arabic: 'غير مخول لرفض هذه الخطوة',
          statusCode: 403
        }
      });
    }

    // Reject the step
    await approval.rejectStep(req.user.id, comments);

    await populateApprovalData(approval);

    res.json({
      success: true,
      message: 'Approval step rejected successfully',
      arabic: 'تم رفض الخطوة بنجاح',
      data: {
        approval
      }
    });
  } catch (error) {
    console.error('Reject step error:', error);
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

// @desc    Skip step
// @route   PUT /api/approvals/:id/skip
// @access  Private
router.put('/:id/skip', protect, [
  body('comments').optional().isLength({ max: 500 }).withMessage('Comments too long')
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

    const { comments = '' } = req.body;
    const approval = await Approval.findById(req.params.id);

    if (!approval) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Approval not found',
          arabic: 'الموافقة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can approve
    if (!approval.canUserApprove(req.user.id, req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to skip this step',
          arabic: 'غير مخول لتخطي هذه الخطوة',
          statusCode: 403
        }
      });
    }

    // Skip the step
    await approval.skipStep(req.user.id, comments);

    await populateApprovalData(approval);

    res.json({
      success: true,
      message: 'Approval step skipped successfully',
      arabic: 'تم تخطي الخطوة بنجاح',
      data: {
        approval
      }
    });
  } catch (error) {
    console.error('Skip step error:', error);
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

// @desc    Cancel approval
// @route   PUT /api/approvals/:id/cancel
// @access  Private
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const approval = await Approval.findById(req.params.id);

    if (!approval) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Approval not found',
          arabic: 'الموافقة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user is the requester or has admin rights
    if (approval.requestedBy.toString() !== req.user.id && !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to cancel this approval',
          arabic: 'غير مخول لإلغاء هذه الموافقة',
          statusCode: 403
        }
      });
    }

    // Cancel the approval
    approval.status = 'cancelled';
    approval.completedAt = new Date();
    approval.updatedAt = new Date();
    await approval.save();

    await populateApprovalData(approval);

    res.json({
      success: true,
      message: 'Approval cancelled successfully',
      arabic: 'تم إلغاء الموافقة بنجاح',
      data: {
        approval
      }
    });
  } catch (error) {
    console.error('Cancel approval error:', error);
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

// @desc    Get approval statistics
// @route   GET /api/approvals/stats/:companyId
// @access  Private
router.get('/stats/:companyId', protect, checkViewPermission, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const stats = await Approval.aggregate([
      {
        $match: {
          company: companyId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const typeStats = await Approval.aggregate([
      {
        $match: {
          company: companyId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        statusStats: stats,
        typeStats: typeStats,
        period: parseInt(period)
      }
    });
  } catch (error) {
    console.error('Get approval stats error:', error);
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
