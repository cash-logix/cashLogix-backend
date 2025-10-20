const express = require('express');
const { body, validationResult } = require('express-validator');
const Company = require('../models/Company');
const { sendInvitationEmail, sendNotificationEmail } = require('../services/emailService');
const {
  protect,
  checkCompanyPermission,
  checkViewPermission,
  checkEditPermission,
  checkDeletePermission,
  checkUserManagementPermission
} = require('../middleware/auth');
const { default: mongoose } = require('mongoose');

const router = express.Router();

// Helper function to safely populate company employees
const populateCompanyEmployees = async (company) => {
  await company.populate([
    { path: 'owner', select: 'firstName lastName email' },
    { path: 'employees.invitedBy', select: 'firstName lastName email' }
  ]);

  // Handle employees.user population separately since it can be either ObjectId or email string
  const User = require('../models/User');

  for (let employee of company.employees) {
    if (employee.user && typeof employee.user === 'object' && employee.user._id) {
      // It's already populated (ObjectId)
      continue;
    } else if (employee.user && typeof employee.user === 'string' && employee.user.includes('@')) {
      // It's an email string (pending invitation) - no need to populate
      continue;
    } else if (employee.user && typeof employee.user === 'string') {
      // It's an ObjectId string - fetch the user manually
      try {
        // Check if it's a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(employee.user)) {
          const user = await User.findById(employee.user).select('firstName lastName email');
          if (user) {
            employee.user = user;
          }
        }
      } catch (err) {
        // If population fails, it might be an invalid ObjectId, keep as is
        console.log('Could not populate user:', err.message);
      }
    }
  }
};

// @desc    Get role permissions
// @route   GET /api/companies/roles/permissions
// @access  Private
router.get('/roles/permissions', protect, async (req, res) => {
  try {
    const Company = require('../models/Company');
    const rolePermissions = Company.getAllRolePermissions();

    res.json({
      success: true,
      data: {
        rolePermissions
      }
    });
  } catch (error) {
    console.error('Get role permissions error:', error);
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

// @desc    Update employee permissions
// @route   PUT /api/companies/:id/employees/:employeeId/permissions
// @access  Private
router.put('/:id/employees/:employeeId/permissions', protect, checkUserManagementPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can manage this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to manage this company',
          arabic: 'غير مخول لإدارة هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { employeeId } = req.params;
    const { permissions } = req.body;

    // Update employee permissions
    await company.updateEmployeePermissions(employeeId, permissions);

    // Populate and return updated company
    await populateCompanyEmployees(company);

    res.json({
      success: true,
      message: 'Employee permissions updated successfully',
      arabic: 'تم تحديث صلاحيات الموظف بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Update employee permissions error:', error);
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

// @desc    Update employee role
// @route   PUT /api/companies/:id/employees/:employeeId/role
// @access  Private
router.put('/:id/employees/:employeeId/role', protect, checkUserManagementPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can manage this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to manage this company',
          arabic: 'غير مخول لإدارة هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { employeeId } = req.params;
    const { role, customPermissions = {} } = req.body;

    // Update employee role
    await company.updateEmployeeRole(employeeId, role, customPermissions);

    // Populate and return updated company
    await populateCompanyEmployees(company);

    res.json({
      success: true,
      message: 'Employee role updated successfully',
      arabic: 'تم تحديث دور الموظف بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Update employee role error:', error);
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

// @desc    Get employee permissions
// @route   GET /api/companies/:id/employees/:employeeId/permissions
// @access  Private
router.get('/:id/employees/:employeeId/permissions', protect, checkViewPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can view this company
    if (!company.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this company',
          arabic: 'غير مخول لعرض هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { employeeId } = req.params;
    const employee = company.employees.find(emp => emp._id.toString() === employeeId.toString());

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Employee not found',
          arabic: 'الموظف غير موجود',
          statusCode: 404
        }
      });
    }

    res.json({
      success: true,
      data: {
        employee: {
          _id: employee._id,
          role: employee.role,
          permissions: employee.permissions
        }
      }
    });
  } catch (error) {
    console.error('Get employee permissions error:', error);
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

// @desc    Get all companies
// @route   GET /api/companies
// @access  Private
router.get('/', protect, checkViewPermission, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query based on user role
    let query = { status: 'active' };

    if (req.user.role === 'individual_user') {
      query.owner = req.user.id;
    } else if (['employee', 'accountant', 'supervisor'].includes(req.user.role)) {
      query.$or = [
        { owner: req.user.id },
        { 'employees.user': req.user.id, 'employees.status': 'active' }
      ];
    }

    const companies = await Company.find(query)
      .populate('owner', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Safely populate employees for each company
    for (let company of companies) {
      await populateCompanyEmployees(company);
    }

    const total = await Company.countDocuments(query);

    res.json({
      success: true,
      data: {
        companies,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get companies error:', error);
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

// @desc    Create new company
// @route   POST /api/companies
// @access  Private
router.post('/', protect, checkCompanyPermission, [
  body('name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Company name is required and must be less than 200 characters'),
  body('contact.email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid company email')
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
      industry,
      businessInfo,
      contact,
      settings
    } = req.body;

    // Create company
    const company = await Company.create({
      name,
      description,
      industry,
      owner: req.user.id,
      businessInfo,
      contact,
      settings: {
        currency: settings?.currency || 'EGP',
        timezone: settings?.timezone || 'Africa/Cairo',
        language: settings?.language || 'ar',
        ...settings
      }
    });

    // Populate the created company
    await company.populate('owner', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      arabic: 'تم إنشاء الشركة بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Create company error:', error);
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

// @desc    Invite employee to company
// @route   POST /api/companies/:id/employees/invite
// @access  Private
router.post('/:id/employees/invite', protect, checkUserManagementPermission, [
  body('email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('role')
    .isIn(['employee', 'accountant', 'supervisor', 'manager', 'admin'])
    .withMessage('Invalid role'),
  body('department')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Department name must be less than 100 characters'),
  body('position')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Position must be less than 100 characters')
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

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can manage this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to manage this company',
          arabic: 'غير مخول لإدارة هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { email, role, department, position } = req.body;

    // Invite employee
    const invitationToken = await company.inviteEmployee(email, role, department, position, req.user.id);

    // Send invitation email
    try {
      await sendInvitationEmail(email, {
        companyName: company.name,
        role: role,
        department: department,
        position: position,
        invitedBy: `${req.user.firstName} ${req.user.lastName}`,
        invitationLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite/${invitationToken}`
      });
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      // Don't fail the invitation if email fails
    }

    // Populate and return updated company
    await populateCompanyEmployees(company);

    res.json({
      success: true,
      message: 'Employee invitation sent successfully',
      arabic: 'تم إرسال دعوة الموظف بنجاح',
      data: {
        company,
        invitationToken,
        invitationLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite/${invitationToken}`
      }
    });
  } catch (error) {
    console.error('Invite employee error:', error);

    // Handle specific error cases
    if (error.message === 'Employee already exists') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Employee already exists or has a pending invitation',
          arabic: 'الموظف موجود بالفعل أو لديه دعوة في الانتظار',
          statusCode: 400
        }
      });
    }

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

// @desc    Accept employee invitation
// @route   POST /api/companies/invite/accept
// @access  Private
router.post('/invite/accept', protect, [
  body('invitationToken')
    .notEmpty()
    .withMessage('Invitation token is required')
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

    const { invitationToken } = req.body;

    // Find company with this invitation token
    const company = await Company.findOne({
      'employees.invitationToken': invitationToken,
      'employees.status': 'pending'
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Invalid or expired invitation',
          arabic: 'دعوة غير صالحة أو منتهية الصلاحية',
          statusCode: 404
        }
      });
    }

    // Accept invitation
    await company.acceptInvitation(invitationToken, req.user.id);

    // Send notification email to company admin
    try {
      const employee = company.employees.find(emp => emp.invitationToken === invitationToken);
      if (employee && company.owner) {
        await sendNotificationEmail(company.owner.email, {
          action: 'Accepted',
          employeeName: `${req.user.firstName} ${req.user.lastName}`,
          employeeEmail: req.user.email,
          role: employee.role,
          department: employee.department,
          companyId: company._id
        });
      }
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
      // Don't fail the acceptance if email fails
    }

    // Populate and return company
    await populateCompanyEmployees(company);

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      arabic: 'تم قبول الدعوة بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
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

// @desc    Resend employee invitation
// @route   POST /api/companies/:id/employees/:employeeId/resend
// @access  Private
router.post('/:id/employees/:employeeId/resend', protect, checkUserManagementPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can manage this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to manage this company',
          arabic: 'غير مخول لإدارة هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { employeeId } = req.params;

    // Resend invitation
    const invitationToken = await company.resendInvitation(employeeId);

    res.json({
      success: true,
      message: 'Invitation resent successfully',
      arabic: 'تم إعادة إرسال الدعوة بنجاح',
      data: {
        invitationToken,
        invitationLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite/${invitationToken}`
      }
    });
  } catch (error) {
    console.error('Resend invitation error:', error);
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

// @desc    Add employee to company
// @route   POST /api/companies/:id/employees
// @access  Private
router.post('/:id/employees', protect, checkUserManagementPermission, [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('role')
    .isIn(['employee', 'accountant', 'supervisor', 'manager', 'admin'])
    .withMessage('Invalid role'),
  body('department')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Department is required')
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

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can manage this company
    if (company.owner.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to manage this company',
          arabic: 'غير مخول لإدارة هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { userId, role, department, team, position, permissions } = req.body;

    // Add employee
    await company.addEmployee(userId, role, department, position, permissions);

    // Populate and return updated company
    await populateCompanyEmployees(company);

    res.json({
      success: true,
      message: 'Employee added successfully',
      arabic: 'تم إضافة الموظف بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Add employee error:', error);
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

// @desc    Add department to company
// @route   POST /api/companies/:id/departments
// @access  Private
router.post('/:id/departments', protect, checkCompanyPermission, [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Department name is required and must be less than 100 characters')
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

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can manage this company
    if (company.owner.toString() !== req.user.id &&
      !['supervisor', 'company_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to manage this company',
          arabic: 'غير مخول لإدارة هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { name, description, managerId, budget } = req.body;

    // Add department
    await company.addDepartment(name, description, managerId, budget);

    // Populate and return updated company
    await company.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'departments.manager', select: 'firstName lastName email fullName' }
    ]);
    await populateCompanyEmployees(company);

    res.json({
      success: true,
      message: 'Department added successfully',
      arabic: 'تم إضافة القسم بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Add department error:', error);
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

// @desc    Get company statistics
// @route   GET /api/companies/stats/summary
// @access  Private
router.get('/stats/summary', protect, checkViewPermission, async (req, res) => {
  try {
    const statistics = await Company.getStatistics(req.user.id);

    res.json({
      success: true,
      data: { statistics }
    });
  } catch (error) {
    console.error('Get company stats error:', error);
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

// @desc    Search companies
// @route   GET /api/companies/search
// @access  Private
router.get('/search', protect, checkViewPermission, async (req, res) => {
  try {
    const { q, industry, status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query based on user role
    let query = { status: 'active' };

    if (req.user.role === 'individual_user') {
      query.owner = req.user.id;
    } else if (['employee', 'accountant', 'supervisor'].includes(req.user.role)) {
      query.$or = [
        { owner: req.user.id },
        { 'employees.user': req.user.id, 'employees.status': 'active' }
      ];
    }

    // Add search filters
    if (q) {
      query.$or = [
        { name: new RegExp(q, 'i') },
        { description: new RegExp(q, 'i') },
        { industry: new RegExp(q, 'i') }
      ];
    }

    if (industry) {
      query.industry = new RegExp(industry, 'i');
    }

    if (status) {
      query.status = status;
    }

    const companies = await Company.find(query)
      .populate('owner', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Safely populate employees for each company
    for (let company of companies) {
      await populateCompanyEmployees(company);
    }

    const total = await Company.countDocuments(query);

    res.json({
      success: true,
      data: {
        companies,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        },
        searchQuery: { q, industry, status }
      }
    });
  } catch (error) {
    console.error('Search companies error:', error);
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

// @desc    Get user's companies (owned and member)
// @route   GET /api/companies/user
// @access  Private
router.get('/user', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get companies owned by user
    const ownedCompanies = await Company.find({ owner: userId })
      .select('name description industry status createdAt')
      .sort({ createdAt: -1 });

    // Get companies where user is an employee
    const memberCompanies = await Company.find({
      'employees.user': userId,
      'employees.status': 'active'
    })
      .select('name description industry status createdAt employees.$')
      .populate('owner', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Format member companies to include user's role
    const formattedMemberCompanies = memberCompanies.map(company => {
      const employee = company.employees && Array.isArray(company.employees)
        ? company.employees.find(emp =>
          emp.user && emp.user.toString() === userId.toString()
        )
        : null;

      return {
        _id: company._id,
        name: company.name,
        description: company.description,
        industry: company.industry,
        status: company.status,
        createdAt: company.createdAt,
        role: employee ? employee.role : 'employee',
        department: employee ? employee.department : null,
        position: employee ? employee.position : null,
        permissions: employee ? employee.permissions : null,
        owner: company.owner
      };
    });

    res.json({
      success: true,
      data: {
        ownedCompanies,
        memberCompanies: formattedMemberCompanies,
        totalOwned: ownedCompanies.length,
        totalMember: formattedMemberCompanies.length
      }
    });
  } catch (error) {
    console.error('Get user companies error:', error);
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

// @desc    Get user's company memberships
// @route   GET /api/companies/memberships
// @access  Private
router.get('/memberships', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get companies where user is an active employee
    const companies = await Company.find({
      'employees.user': userId,
      'employees.status': 'active'
    })
      .select('name description industry status createdAt')
      .populate('owner', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Format companies to include user's role and permissions
    const formattedCompanies = companies.map(company => {
      const employee = company.employees && Array.isArray(company.employees)
        ? company.employees.find(emp =>
          emp.user && emp.user.toString() === userId.toString()
        )
        : null;

      return {
        _id: company._id,
        name: company.name,
        description: company.description,
        industry: company.industry,
        status: company.status,
        createdAt: company.createdAt,
        role: employee ? employee.role : 'employee',
        department: employee ? employee.department : null,
        position: employee ? employee.position : null,
        permissions: employee ? employee.permissions : null,
        startDate: employee ? employee.startDate : null,
        owner: company.owner
      };
    });

    res.json({
      success: true,
      data: {
        companies: formattedCompanies,
        total: formattedCompanies.length
      }
    });
  } catch (error) {
    console.error('Get user memberships error:', error);
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

// @desc    Get company by ID
// @route   GET /api/companies/:id
// @access  Private
router.get('/:id', protect, checkViewPermission, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid company ID',
          arabic: 'معرّف الشركة غير صالح',
          statusCode: 400
        }
      });
    }
    const company = await Company.findById(req.params.id)
      .populate('owner', 'firstName lastName email')
      .populate('departments.manager', 'firstName lastName email fullName');

    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Safely populate employees
    await populateCompanyEmployees(company);

    // Check if user can view this company
    if (!company.canUserView(req.user.id)) {
      console.log('Access denied for user:', req.user.id, 'to company:', company._id);
      console.log('Company owner:', company.owner);
      console.log('Company employees:', company.employees?.map(emp => ({ user: emp.user, status: emp.status })));

      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this company',
          arabic: 'غير مخول لعرض هذه الشركة',
          statusCode: 403,
          debug: {
            userId: req.user.id,
            companyId: company._id,
            companyOwner: company.owner,
            userRole: req.user.role
          }
        }
      });
    }

    res.json({
      success: true,
      data: { company }
    });
  } catch (error) {
    console.error('Get company error:', error);
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

// @desc    Update company
// @route   PUT /api/companies/:id
// @access  Private
router.put('/:id', protect, checkEditPermission, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Company name must be less than 200 characters'),
  body('contact.email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid company email')
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

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this company',
          arabic: 'غير مخول لتعديل هذه الشركة',
          statusCode: 403
        }
      });
    }

    const {
      name,
      description,
      industry,
      businessInfo,
      contact,
      settings
    } = req.body;

    // Update company
    const updatedCompany = await Company.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name }),
        ...(description && { description }),
        ...(industry && { industry }),
        ...(businessInfo && { businessInfo }),
        ...(contact && { contact }),
        ...(settings && { settings })
      },
      { new: true, runValidators: true }
    ).populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'departments.manager', select: 'firstName lastName email' }
    ]);
    await populateCompanyEmployees(company);

    res.json({
      success: true,
      message: 'Company updated successfully',
      arabic: 'تم تحديث الشركة بنجاح',
      data: { company: updatedCompany }
    });
  } catch (error) {
    console.error('Update company error:', error);
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

// @desc    Delete company
// @route   DELETE /api/companies/:id
// @access  Private
router.delete('/:id', protect, checkDeletePermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can delete this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to delete this company',
          arabic: 'غير مخول لحذف هذه الشركة',
          statusCode: 403
        }
      });
    }

    // Soft delete by setting status to deleted
    company.status = 'deleted';
    await company.save();

    res.json({
      success: true,
      message: 'Company deleted successfully',
      arabic: 'تم حذف الشركة بنجاح'
    });
  } catch (error) {
    console.error('Delete company error:', error);
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

// @desc    Remove employee from company
// @route   DELETE /api/companies/:id/employees/:employeeId
// @access  Private
router.delete('/:id/employees/:employeeId', protect, checkUserManagementPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can manage this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to manage this company',
          arabic: 'غير مخول لإدارة هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { employeeId } = req.params;

    // Remove employee
    await company.removeEmployee(employeeId);

    // Populate and return updated company
    await populateCompanyEmployees(company);

    res.json({
      success: true,
      message: 'Employee removed successfully',
      arabic: 'تم إزالة الموظف بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Remove employee error:', error);
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

// @desc    Update employee role
// @route   PUT /api/companies/:id/employees/:employeeId
// @access  Private
router.put('/:id/employees/:employeeId', protect, checkUserManagementPermission, [
  body('role')
    .isIn(['employee', 'accountant', 'supervisor', 'manager', 'admin'])
    .withMessage('Invalid role')
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

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can manage this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to manage this company',
          arabic: 'غير مخول لإدارة هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { employeeId } = req.params;
    const { role, department, position, permissions } = req.body;

    // Update employee
    await company.updateEmployee(employeeId, { role, department, position, permissions });

    // Populate and return updated company
    await populateCompanyEmployees(company);

    res.json({
      success: true,
      message: 'Employee updated successfully',
      arabic: 'تم تحديث الموظف بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Update employee error:', error);
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

// @desc    Get company employees
// @route   GET /api/companies/:id/employees
// @access  Private
router.get('/:id/employees', protect, checkViewPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .select('employees owner');

    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Safely populate employees
    await populateCompanyEmployees(company);

    // Check if user can view this company
    if (!company.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this company',
          arabic: 'غير مخول لعرض هذه الشركة',
          statusCode: 403
        }
      });
    }

    res.json({
      success: true,
      data: {
        employees: company.employees,
        owner: company.owner
      }
    });
  } catch (error) {
    console.error('Get company employees error:', error);
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

// @desc    Get company departments
// @route   GET /api/companies/:id/departments
// @access  Private
router.get('/:id/departments', protect, checkViewPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate('departments.manager', 'firstName lastName email fullName')
      .select('departments owner');

    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can view this company
    if (!company.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this company',
          arabic: 'غير مخول لعرض هذه الشركة',
          statusCode: 403
        }
      });
    }

    res.json({
      success: true,
      data: {
        departments: company.departments
      }
    });
  } catch (error) {
    console.error('Get company departments error:', error);
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

// @desc    Update department
// @route   PUT /api/companies/:id/departments/:departmentId
// @access  Private
router.put('/:id/departments/:departmentId', protect, checkEditPermission, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Department name must be less than 100 characters')
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

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this company',
          arabic: 'غير مخول لتعديل هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { departmentId } = req.params;
    const { name, description, managerId, budget } = req.body;

    // Update department
    await company.updateDepartment(departmentId, { name, description, managerId, budget });

    // Populate and return updated company
    await company.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'departments.manager', select: 'firstName lastName email fullName' }
    ]);

    res.json({
      success: true,
      message: 'Department updated successfully',
      arabic: 'تم تحديث القسم بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Update department error:', error);
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

// @desc    Remove department
// @route   DELETE /api/companies/:id/departments/:departmentId
// @access  Private
router.delete('/:id/departments/:departmentId', protect, checkEditPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this company',
          arabic: 'غير مخول لتعديل هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { departmentId } = req.params;

    // Remove department
    await company.removeDepartment(departmentId);

    // Populate and return updated company
    await company.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'departments.manager', select: 'firstName lastName email' }
    ]);

    res.json({
      success: true,
      message: 'Department removed successfully',
      arabic: 'تم إزالة القسم بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Remove department error:', error);
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

// ==================== DEPARTMENT BUDGET MANAGEMENT ====================

// @desc    Update department budget
// @route   PUT /api/companies/:id/departments/:departmentId/budget
// @access  Private
router.put('/:id/departments/:departmentId/budget', protect, checkEditPermission, [
  body('total')
    .optional()
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Budget total must be a positive number'),
  body('currency')
    .optional()
    .isIn(['EGP', 'USD', 'EUR', 'SAR', 'AED'])
    .withMessage('Invalid currency'),
  body('alertThreshold')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Alert threshold must be between 0 and 100'),
  body('fiscalYear')
    .optional()
    .isLength({ min: 4, max: 4 })
    .withMessage('Fiscal year must be 4 digits')
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

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this company',
          arabic: 'غير مخول لتعديل هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { departmentId } = req.params;
    const budgetData = req.body;

    // Update department budget
    await company.updateDepartmentBudget(departmentId, budgetData);

    // Populate and return updated company
    await company.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'departments.manager', select: 'firstName lastName email' }
    ]);

    res.json({
      success: true,
      message: 'Department budget updated successfully',
      arabic: 'تم تحديث ميزانية القسم بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Update department budget error:', error);
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

// @desc    Get department budget alerts
// @route   GET /api/companies/:id/departments/budget-alerts
// @access  Private
router.get('/:id/departments/budget-alerts', protect, checkViewPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can view this company
    if (!company.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this company',
          arabic: 'غير مخول لعرض هذه الشركة',
          statusCode: 403
        }
      });
    }

    const alerts = company.getDepartmentBudgetAlerts();

    res.json({
      success: true,
      data: { alerts }
    });
  } catch (error) {
    console.error('Get budget alerts error:', error);
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

// @desc    Get department budget summary
// @route   GET /api/companies/:id/departments/budget-summary
// @access  Private
router.get('/:id/departments/budget-summary', protect, checkViewPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can view this company
    if (!company.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this company',
          arabic: 'غير مخول لعرض هذه الشركة',
          statusCode: 403
        }
      });
    }

    const summary = company.getDepartmentBudgetSummary();

    res.json({
      success: true,
      data: { summary }
    });
  } catch (error) {
    console.error('Get budget summary error:', error);
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

// @desc    Add expense to department budget
// @route   POST /api/companies/:id/departments/:departmentId/expense
// @access  Private
router.post('/:id/departments/:departmentId/expense', protect, checkEditPermission, [
  body('amount')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number')
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

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this company',
          arabic: 'غير مخول لتعديل هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { departmentId } = req.params;
    const { amount } = req.body;

    // Add expense to department budget
    await company.addDepartmentExpense(departmentId, amount);

    // Populate and return updated company
    await company.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'departments.manager', select: 'firstName lastName email' }
    ]);

    res.json({
      success: true,
      message: 'Expense added to department budget successfully',
      arabic: 'تم إضافة المصروف إلى ميزانية القسم بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Add department expense error:', error);
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

// @desc    Remove expense from department budget
// @route   DELETE /api/companies/:id/departments/:departmentId/expense
// @access  Private
router.delete('/:id/departments/:departmentId/expense', protect, checkEditPermission, [
  body('amount')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number')
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

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this company',
          arabic: 'غير مخول لتعديل هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { departmentId } = req.params;
    const { amount } = req.body;

    // Remove expense from department budget
    await company.removeDepartmentExpense(departmentId, amount);

    // Populate and return updated company
    await company.populate([
      { path: 'owner', select: 'firstName lastName email' },
      { path: 'departments.manager', select: 'firstName lastName email' }
    ]);

    res.json({
      success: true,
      message: 'Expense removed from department budget successfully',
      arabic: 'تم إزالة المصروف من ميزانية القسم بنجاح',
      data: { company }
    });
  } catch (error) {
    console.error('Remove department expense error:', error);
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

// @desc    Get company analytics
// @route   GET /api/companies/:id/analytics
// @access  Private
router.get('/:id/analytics', protect, checkViewPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can view this company
    if (!company.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this company',
          arabic: 'غير مخول لعرض هذه الشركة',
          statusCode: 403
        }
      });
    }

    // Get company analytics
    const analytics = await company.getAnalytics();

    res.json({
      success: true,
      data: {
        company: {
          id: company._id,
          name: company.name,
          industry: company.industry
        },
        analytics
      }
    });
  } catch (error) {
    console.error('Get company analytics error:', error);
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

// @desc    Debug company authorization
// @route   GET /api/companies/:id/debug
// @access  Private
router.get('/:id/debug', protect, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    res.json({
      success: true,
      data: {
        userId: req.user.id,
        userRole: req.user.role,
        companyOwner: company.owner ? company.owner.toString() : 'undefined',
        ownerMatch: company.owner ? company.owner.toString() === req.user.id.toString() : false,
        canView: company.canUserView(req.user.id),
        companyId: company._id.toString()
      }
    });
  } catch (error) {
    console.error('Debug company error:', error);
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

// @desc    Get company settings
// @route   GET /api/companies/:id/settings
// @access  Private
router.get('/:id/settings', protect, checkViewPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).select('settings name owner');

    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can view this company
    if (!company.canUserView(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to view this company',
          arabic: 'غير مخول لعرض هذه الشركة',
          statusCode: 403
        }
      });
    }

    res.json({
      success: true,
      data: {
        company: {
          id: company._id,
          name: company.name
        },
        settings: company.settings
      }
    });
  } catch (error) {
    console.error('Get company settings error:', error);
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

// @desc    Update company settings
// @route   PUT /api/companies/:id/settings
// @access  Private
router.put('/:id/settings', protect, checkEditPermission, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Company not found',
          arabic: 'الشركة غير موجودة',
          statusCode: 404
        }
      });
    }

    // Check if user can edit this company
    if (!company.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Not authorized to edit this company',
          arabic: 'غير مخول لتعديل هذه الشركة',
          statusCode: 403
        }
      });
    }

    const { settings } = req.body;

    // Update settings
    company.settings = { ...company.settings, ...settings };
    await company.save();

    res.json({
      success: true,
      message: 'Company settings updated successfully',
      arabic: 'تم تحديث إعدادات الشركة بنجاح',
      data: { settings: company.settings }
    });
  } catch (error) {
    console.error('Update company settings error:', error);
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

// @desc    Get user's companies (owned and member)
// @route   GET /api/companies/user
// @access  Private
router.get('/user', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get companies owned by user
    const ownedCompanies = await Company.find({ owner: userId })
      .select('name description industry status createdAt')
      .sort({ createdAt: -1 });

    // Get companies where user is an employee
    const memberCompanies = await Company.find({
      'employees.user': userId,
      'employees.status': 'active'
    })
      .select('name description industry status createdAt employees.$')
      .populate('owner', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Format member companies to include user's role
    const formattedMemberCompanies = memberCompanies.map(company => {
      const employee = company.employees && Array.isArray(company.employees)
        ? company.employees.find(emp =>
          emp.user && emp.user.toString() === userId.toString()
        )
        : null;

      return {
        _id: company._id,
        name: company.name,
        description: company.description,
        industry: company.industry,
        status: company.status,
        createdAt: company.createdAt,
        role: employee ? employee.role : 'employee',
        department: employee ? employee.department : null,
        position: employee ? employee.position : null,
        permissions: employee ? employee.permissions : null,
        owner: company.owner
      };
    });

    res.json({
      success: true,
      data: {
        ownedCompanies,
        memberCompanies: formattedMemberCompanies,
        totalOwned: ownedCompanies.length,
        totalMember: formattedMemberCompanies.length
      }
    });
  } catch (error) {
    console.error('Get user companies error:', error);
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
