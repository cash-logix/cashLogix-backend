const mongoose = require('mongoose');

// Role-based permission templates
const ROLE_PERMISSIONS = {
  employee: {
    canViewAllData: false,
    canEditAllData: false,
    canViewOwnData: true,
    canEditOwnData: true,
    canCreateProjects: false,
    canEditProjects: false,
    canDeleteProjects: false,
    canViewProjects: true,
    canManageUsers: false,
    canInviteUsers: false,
    canRemoveUsers: false,
    canEditUserRoles: false,
    canViewReports: true,
    canExportReports: false,
    canApproveExpenses: false,
    canRejectExpenses: false,
    approvalLimit: 0,
    canManageDepartments: false,
    canCreateDepartments: false,
    canEditDepartments: false,
    canDeleteDepartments: false,
    canEditCompanySettings: false,
    canViewCompanySettings: false,
    canAccessAnalytics: false,
    canManageIntegrations: false,
    canViewAuditLogs: false
  },
  accountant: {
    canViewAllData: true,
    canEditAllData: false,
    canViewOwnData: true,
    canEditOwnData: true,
    canCreateProjects: false,
    canEditProjects: false,
    canDeleteProjects: false,
    canViewProjects: true,
    canManageUsers: false,
    canInviteUsers: false,
    canRemoveUsers: false,
    canEditUserRoles: false,
    canViewReports: true,
    canExportReports: true,
    canApproveExpenses: true,
    canRejectExpenses: true,
    approvalLimit: 1000,
    canManageDepartments: false,
    canCreateDepartments: false,
    canEditDepartments: false,
    canDeleteDepartments: false,
    canEditCompanySettings: false,
    canViewCompanySettings: true,
    canAccessAnalytics: true,
    canManageIntegrations: false,
    canViewAuditLogs: true
  },
  supervisor: {
    canViewAllData: true,
    canEditAllData: false,
    canViewOwnData: true,
    canEditOwnData: true,
    canCreateProjects: true,
    canEditProjects: true,
    canDeleteProjects: false,
    canViewProjects: true,
    canManageUsers: false,
    canInviteUsers: true,
    canRemoveUsers: false,
    canEditUserRoles: false,
    canViewReports: true,
    canExportReports: true,
    canApproveExpenses: true,
    canRejectExpenses: true,
    approvalLimit: 5000,
    canManageDepartments: true,
    canCreateDepartments: true,
    canEditDepartments: true,
    canDeleteDepartments: false,
    canEditCompanySettings: false,
    canViewCompanySettings: true,
    canAccessAnalytics: true,
    canManageIntegrations: false,
    canViewAuditLogs: true
  },
  manager: {
    canViewAllData: true,
    canEditAllData: true,
    canViewOwnData: true,
    canEditOwnData: true,
    canCreateProjects: true,
    canEditProjects: true,
    canDeleteProjects: true,
    canViewProjects: true,
    canManageUsers: true,
    canInviteUsers: true,
    canRemoveUsers: true,
    canEditUserRoles: true,
    canViewReports: true,
    canExportReports: true,
    canApproveExpenses: true,
    canRejectExpenses: true,
    approvalLimit: 10000,
    canManageDepartments: true,
    canCreateDepartments: true,
    canEditDepartments: true,
    canDeleteDepartments: true,
    canEditCompanySettings: true,
    canViewCompanySettings: true,
    canAccessAnalytics: true,
    canManageIntegrations: true,
    canViewAuditLogs: true
  },
  admin: {
    canViewAllData: true,
    canEditAllData: true,
    canViewOwnData: true,
    canEditOwnData: true,
    canCreateProjects: true,
    canEditProjects: true,
    canDeleteProjects: true,
    canViewProjects: true,
    canManageUsers: true,
    canInviteUsers: true,
    canRemoveUsers: true,
    canEditUserRoles: true,
    canViewReports: true,
    canExportReports: true,
    canApproveExpenses: true,
    canRejectExpenses: true,
    approvalLimit: 50000,
    canManageDepartments: true,
    canCreateDepartments: true,
    canEditDepartments: true,
    canDeleteDepartments: true,
    canEditCompanySettings: true,
    canViewCompanySettings: true,
    canAccessAnalytics: true,
    canManageIntegrations: true,
    canViewAuditLogs: true
  }
};

const companySchema = new mongoose.Schema({
  // Company Information
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [200, 'Company name cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  industry: {
    type: String,
    trim: true,
    maxlength: [100, 'Industry cannot exceed 100 characters']
  },

  // Company Owner
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Business Information
  businessInfo: {
    registrationNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true
    },
    taxNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true
    },
    legalForm: {
      type: String,
      enum: [
        'sole_proprietorship',
        'partnership',
        'llc',
        'corporation',
        'other',
        'شركة ذات مسؤولية محدودة',
        'شركة تضامن',
        'شركة توصية بسيطة',
        'شركة توصية بالأسهم',
        'شركة مساهمة',
        'مؤسسة فردية'
      ],
      default: 'llc'
    },
    establishedDate: Date,
    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/, 'Please provide a valid website URL']
    }
  },

  // Contact Information
  contact: {
    email: {
      type: String,
      required: [true, 'Company email is required'],
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email'
      ]
    },
    phone: {
      type: String,
      trim: true,
      match: [/^(\+\d{1,3})?[0-9]{10,15}$/, 'Please provide a valid phone number']
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: {
        type: String,
        default: 'Egypt'
      }
    }
  },

  // Subscription Information
  subscription: {
    plan: {
      type: String,
      enum: ['company_plan'],
      default: 'company_plan'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled', 'expired'],
      default: 'active'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: Date,
    autoRenew: {
      type: Boolean,
      default: true
    },
    paymentMethod: {
      type: String,
      enum: ['vodafone_cash', 'instapay', 'bank_transfer']
    },
    maxUsers: {
      type: Number,
      default: 50
    },
    maxProjects: {
      type: Number,
      default: 100
    }
  },

  // Departments and Teams
  departments: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Department name cannot exceed 100 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    budget: {
      total: {
        type: Number,
        default: 0,
        min: 0
      },
      spent: {
        type: Number,
        default: 0,
        min: 0
      },
      remaining: {
        type: Number,
        default: 0,
        min: 0
      },
      currency: {
        type: String,
        default: 'EGP',
        enum: ['EGP', 'USD', 'EUR', 'SAR', 'AED']
      },
      alertThreshold: {
        type: Number,
        default: 80, // Alert when 80% of budget is spent
        min: 0,
        max: 100
      },
      fiscalYear: {
        type: String,
        default: () => new Date().getFullYear().toString()
      },
      lastUpdated: {
        type: Date,
        default: Date.now
      }
    },
    teams: [{
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: [100, 'Team name cannot exceed 100 characters']
      },
      description: String,
      leader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Employee Management
  employees: [{
    user: {
      type: mongoose.Schema.Types.Mixed, // Can be ObjectId or String (email)
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['employee', 'accountant', 'supervisor', 'manager', 'admin'],
      default: 'employee'
    },
    department: String,
    team: String,
    position: {
      type: String,
      trim: true,
      maxlength: [100, 'Position cannot exceed 100 characters']
    },
    salary: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'EGP',
      enum: ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'LBP']
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: Date,
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'terminated'],
      default: 'pending'
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    invitationToken: {
      type: String,
      unique: true,
      sparse: true
    },
    invitationExpires: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    },
    permissions: {
      // Data Access Permissions
      canViewAllData: {
        type: Boolean,
        default: false
      },
      canEditAllData: {
        type: Boolean,
        default: false
      },
      canViewOwnData: {
        type: Boolean,
        default: true
      },
      canEditOwnData: {
        type: Boolean,
        default: true
      },

      // Project Management Permissions
      canCreateProjects: {
        type: Boolean,
        default: false
      },
      canEditProjects: {
        type: Boolean,
        default: false
      },
      canDeleteProjects: {
        type: Boolean,
        default: false
      },
      canViewProjects: {
        type: Boolean,
        default: true
      },

      // User Management Permissions
      canManageUsers: {
        type: Boolean,
        default: false
      },
      canInviteUsers: {
        type: Boolean,
        default: false
      },
      canRemoveUsers: {
        type: Boolean,
        default: false
      },
      canEditUserRoles: {
        type: Boolean,
        default: false
      },

      // Financial Permissions
      canViewReports: {
        type: Boolean,
        default: true
      },
      canExportReports: {
        type: Boolean,
        default: false
      },
      canApproveExpenses: {
        type: Boolean,
        default: false
      },
      canRejectExpenses: {
        type: Boolean,
        default: false
      },
      approvalLimit: {
        type: Number,
        default: 0
      },

      // Department Management Permissions
      canManageDepartments: {
        type: Boolean,
        default: false
      },
      canCreateDepartments: {
        type: Boolean,
        default: false
      },
      canEditDepartments: {
        type: Boolean,
        default: false
      },
      canDeleteDepartments: {
        type: Boolean,
        default: false
      },

      // Company Settings Permissions
      canEditCompanySettings: {
        type: Boolean,
        default: false
      },
      canViewCompanySettings: {
        type: Boolean,
        default: false
      },

      // Advanced Permissions
      canAccessAnalytics: {
        type: Boolean,
        default: false
      },
      canManageIntegrations: {
        type: Boolean,
        default: false
      },
      canViewAuditLogs: {
        type: Boolean,
        default: false
      }
    }
  }],

  // Company Settings
  settings: {
    currency: {
      type: String,
      default: 'EGP',
      enum: ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'LBP']
    },
    timezone: {
      type: String,
      default: 'Africa/Cairo'
    },
    language: {
      type: String,
      enum: ['ar', 'en'],
      default: 'ar'
    },
    dateFormat: {
      type: String,
      default: 'DD/MM/YYYY'
    },
    fiscalYearStart: {
      type: String,
      default: '01-01' // MM-DD format
    },
    workingDays: {
      type: [String],
      default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    },
    workingHours: {
      start: {
        type: String,
        default: '09:00'
      },
      end: {
        type: String,
        default: '17:00'
      }
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      },
      budgetAlerts: {
        type: Boolean,
        default: true
      },
      deadlineAlerts: {
        type: Boolean,
        default: true
      },
      employeeActivity: {
        type: Boolean,
        default: true
      }
    },
    approvalWorkflow: {
      enabled: {
        type: Boolean,
        default: true
      },
      requireApprovalFor: {
        expenses: {
          type: Boolean,
          default: true
        },
        revenues: {
          type: Boolean,
          default: false
        },
        projects: {
          type: Boolean,
          default: true
        }
      },
      autoApproveLimit: {
        type: Number,
        default: 1000 // EGP
      }
    }
  },

  // Financial Information
  financial: {
    totalBudget: {
      type: Number,
      default: 0,
      min: 0
    },
    totalExpenses: {
      type: Number,
      default: 0,
      min: 0
    },
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0
    },
    profitMargin: {
      type: Number,
      default: 0
    }
  },

  // Company Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationDate: Date,

  // Additional Information
  logo: {
    type: String,
    default: null
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
companySchema.index({ owner: 1 });
// Note: businessInfo.registrationNumber index is automatically created due to unique: true in schema
// Note: businessInfo.taxNumber index is automatically created due to unique: true in schema
companySchema.index({ 'contact.email': 1 });
companySchema.index({ status: 1 });
companySchema.index({ 'subscription.status': 1 });
companySchema.index({ createdAt: -1 });

// Virtual for employee count
companySchema.virtual('employeeCount').get(function () {
  return this.employees && Array.isArray(this.employees)
    ? this.employees.filter(emp => emp.status === 'active').length
    : 0;
});

// Virtual for department count
companySchema.virtual('departmentCount').get(function () {
  return this.departments && Array.isArray(this.departments)
    ? this.departments.length
    : 0;
});

// Virtual for project count
companySchema.virtual('projectCount').get(function () {
  return this.projects ? this.projects.length : 0;
});

// Virtual for net profit
companySchema.virtual('netProfit').get(function () {
  const totalRevenue = this.financial?.totalRevenue || 0;
  const totalExpenses = this.financial?.totalExpenses || 0;
  return totalRevenue - totalExpenses;
});

// Virtual for budget utilization
companySchema.virtual('budgetUtilization').get(function () {
  const totalBudget = this.financial?.totalBudget || 0;
  const totalExpenses = this.financial?.totalExpenses || 0;
  return totalBudget > 0 ? Math.round((totalExpenses / totalBudget) * 100) : 0;
});

// Pre-save middleware to calculate profit margin
companySchema.pre('save', function (next) {
  if (this.financial.totalRevenue > 0) {
    this.financial.profitMargin = Math.round(
      ((this.financial.totalRevenue - this.financial.totalExpenses) / this.financial.totalRevenue) * 100
    );
  }
  next();
});

// Instance method to add employee
companySchema.methods.addEmployee = function (userId, role, department, position, customPermissions = {}) {
  // Check if user is already an employee
  const existingEmployee = this.employees.find(emp => emp.user.toString() === userId.toString());
  if (existingEmployee) {
    throw new Error('User is already an employee of this company');
  }

  // Get default permissions for the role
  const defaultPermissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.employee;

  // Merge with custom permissions
  const permissions = { ...defaultPermissions, ...customPermissions };

  this.employees.push({
    user: userId,
    role: role,
    department: department,
    position: position,
    permissions: permissions,
    startDate: new Date(),
    status: 'active'
  });

  return this.save();
};

// Instance method to remove employee
companySchema.methods.removeEmployee = function (employeeId) {
  // Find the employee by _id (the employee's own ID, not the user ID)
  const employeeIndex = this.employees.findIndex(emp => emp._id.toString() === employeeId.toString());
  if (employeeIndex === -1) {
    throw new Error('Employee not found');
  }

  this.employees.splice(employeeIndex, 1);
  return this.save();
};

// Instance method to update employee
companySchema.methods.updateEmployee = function (employeeId, updateData) {
  const employee = this.employees.find(emp => emp._id.toString() === employeeId.toString());
  if (!employee) {
    throw new Error('Employee not found');
  }

  Object.assign(employee, updateData);
  return this.save();
};

// Instance method to update employee role
companySchema.methods.updateEmployeeRole = function (employeeId, newRole, customPermissions = {}) {
  const employee = this.employees.find(emp => emp._id.toString() === employeeId.toString());
  if (!employee) {
    throw new Error('Employee not found');
  }

  employee.role = newRole;

  // Get default permissions for the new role
  const defaultPermissions = ROLE_PERMISSIONS[newRole] || ROLE_PERMISSIONS.employee;

  // Merge with custom permissions
  employee.permissions = { ...defaultPermissions, ...customPermissions };

  return this.save();
};

// Instance method to update employee permissions
companySchema.methods.updateEmployeePermissions = function (employeeId, newPermissions) {
  const employee = this.employees.find(emp => emp._id.toString() === employeeId.toString());
  if (!employee) {
    throw new Error('Employee not found');
  }

  employee.permissions = { ...employee.permissions, ...newPermissions };
  return this.save();
};

// Static method to get role permissions
companySchema.statics.getRolePermissions = function (role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.employee;
};

// Static method to get all role permissions
companySchema.statics.getAllRolePermissions = function () {
  return ROLE_PERMISSIONS;
};

// Instance method to add department
companySchema.methods.addDepartment = function (name, description, managerId, budget = { total: 0, spent: 0, currency: 'EGP', alertThreshold: 80 }) {
  // Check if department already exists
  const existingDept = this.departments.find(dept => dept.name.toLowerCase() === name.toLowerCase());
  if (existingDept) {
    throw new Error('Department already exists');
  }

  const total = budget.total || 0;
  const spent = budget.spent || 0;
  const remaining = total - spent;

  this.departments.push({
    name: name,
    description: description,
    manager: managerId,
    budget: {
      total: total,
      spent: spent,
      remaining: remaining,
      currency: budget.currency || 'EGP',
      alertThreshold: budget.alertThreshold || 80,
      fiscalYear: new Date().getFullYear().toString(),
      lastUpdated: new Date()
    },
    teams: [],
    createdAt: new Date()
  });

  return this.save();
};

// Instance method to update department
companySchema.methods.updateDepartment = function (departmentId, updateData) {
  const department = this.departments.id(departmentId);
  if (!department) {
    throw new Error('Department not found');
  }

  // Handle budget separately to ensure proper structure
  if (updateData.budget) {
    department.budget = {
      total: updateData.budget.total || department.budget.total || 0,
      spent: updateData.budget.spent || department.budget.spent || 0
    };
  }

  // Update other fields
  const { budget, ...otherData } = updateData;
  Object.assign(department, otherData);

  return this.save();
};

// Instance method to remove department
companySchema.methods.removeDepartment = function (departmentId) {
  this.departments = this.departments.filter(dept => dept._id.toString() !== departmentId.toString());
  return this.save();
};

// Instance method to add team to department
companySchema.methods.addTeam = function (departmentName, teamName, description, leaderId) {
  const department = this.departments.find(dept => dept.name === departmentName);
  if (!department) {
    throw new Error('Department not found');
  }

  // Check if team already exists
  const existingTeam = department.teams.find(team => team.name.toLowerCase() === teamName.toLowerCase());
  if (existingTeam) {
    throw new Error('Team already exists in this department');
  }

  department.teams.push({
    name: teamName,
    description: description,
    leader: leaderId,
    members: []
  });

  return this.save();
};

// Instance method to check if user is employee
companySchema.methods.isEmployee = function (userId) {
  return this.employees.some(emp =>
    emp.user.toString() === userId.toString() && emp.status === 'active'
  );
};

// Instance method to get employee permissions
companySchema.methods.getEmployeePermissions = function (userId) {
  const employee = this.employees.find(emp =>
    emp.user.toString() === userId.toString() && emp.status === 'active'
  );

  return employee ? employee.permissions : null;
};

// Instance method to check if user can perform action
companySchema.methods.canUserPerform = function (userId, action) {
  if (this.owner) {
    const ownerId = this.owner._id ? this.owner._id.toString() : this.owner.toString();
    if (ownerId === userId.toString()) {
      return true; // Owner has all permissions
    }
  }

  const permissions = this.getEmployeePermissions(userId);
  if (!permissions) {
    return false;
  }

  // Map action strings to permission properties
  const actionMap = {
    'view_all_data': 'canViewAllData',
    'edit_all_data': 'canEditAllData',
    'view_own_data': 'canViewOwnData',
    'edit_own_data': 'canEditOwnData',
    'create_projects': 'canCreateProjects',
    'edit_projects': 'canEditProjects',
    'delete_projects': 'canDeleteProjects',
    'view_projects': 'canViewProjects',
    'manage_users': 'canManageUsers',
    'invite_users': 'canInviteUsers',
    'remove_users': 'canRemoveUsers',
    'edit_user_roles': 'canEditUserRoles',
    'view_reports': 'canViewReports',
    'export_reports': 'canExportReports',
    'approve_expenses': 'canApproveExpenses',
    'reject_expenses': 'canRejectExpenses',
    'manage_departments': 'canManageDepartments',
    'create_departments': 'canCreateDepartments',
    'edit_departments': 'canEditDepartments',
    'delete_departments': 'canDeleteDepartments',
    'edit_company_settings': 'canEditCompanySettings',
    'view_company_settings': 'canViewCompanySettings',
    'access_analytics': 'canAccessAnalytics',
    'manage_integrations': 'canManageIntegrations',
    'view_audit_logs': 'canViewAuditLogs'
  };

  const permissionKey = actionMap[action];
  return permissionKey ? permissions[permissionKey] : false;
};

// Instance method to update financial data
companySchema.methods.updateFinancialData = function () {
  // This would typically be called when expenses/revenues are added/updated
  // For now, we'll just recalculate based on existing data
  return this.save();
};

// Static method to find by owner
companySchema.statics.findByOwner = function (ownerId) {
  return this.find({ owner: ownerId, status: 'active' }).sort({ createdAt: -1 });
};

// Static method to find by employee
companySchema.statics.findByEmployee = function (userId) {
  return this.find({
    'employees.user': userId,
    'employees.status': 'active',
    status: 'active'
  }).sort({ createdAt: -1 });
};

// Static method to find active companies
companySchema.statics.findActive = function () {
  return this.find({
    status: 'active',
    'subscription.status': 'active'
  }).sort({ createdAt: -1 });
};

// Instance method to check if user can view company
companySchema.methods.canUserView = function (userId) {
  // Owner can always view
  if (this.owner) {
    const ownerId = this.owner._id ? this.owner._id.toString() : this.owner.toString();
    if (ownerId === userId.toString()) {
      return true;
    }
  }

  // Check if user is an active employee
  if (this.employees && Array.isArray(this.employees)) {
    return this.employees.some(emp => {
      if (!emp.user || emp.status !== 'active') {
        return false;
      }

      // Handle both populated user objects and user ID strings
      if (typeof emp.user === 'object' && emp.user._id) {
        return emp.user._id.toString() === userId.toString();
      } else if (typeof emp.user === 'string') {
        return emp.user === userId.toString();
      }

      return false;
    });
  }

  return false;
};

// Instance method to check if user can edit company
companySchema.methods.canUserEdit = function (userId) {
  // Owner can always edit
  if (this.owner) {
    const ownerId = this.owner._id ? this.owner._id.toString() : this.owner.toString();
    if (ownerId === userId.toString()) {
      return true;
    }
  }

  // Check if user is an employee with edit permissions
  if (this.employees && Array.isArray(this.employees)) {
    const employee = this.employees.find(emp =>
      emp.user && emp.user.toString() === userId.toString() && emp.status === 'active'
    );

    return employee && ['admin', 'supervisor', 'manager'].includes(employee.role);
  }

  return false;
};

// Instance method to get analytics
companySchema.methods.getAnalytics = function () {
  return {
    employeeCount: this.employeeCount || 0,
    departmentCount: this.departmentCount || 0,
    projectCount: this.projectCount || 0,
    netProfit: this.netProfit || 0,
    budgetUtilization: this.budgetUtilization || 0,
    financial: this.financial || {},
    departments: (this.departments && Array.isArray(this.departments)) ? this.departments.map(dept => ({
      name: dept.name,
      employeeCount: (dept.teams && Array.isArray(dept.teams)) ? dept.teams.reduce((total, team) => total + (team.members ? team.members.length : 0), 0) : 0,
      budget: dept.budget || {}
    })) : []
  };
};

// Instance method to invite employee by email
companySchema.methods.inviteEmployee = function (email, role, department, position, invitedBy) {
  const crypto = require('crypto');

  // Check if employee already exists
  const existingEmployee = this.employees.find(emp =>
    emp.user && emp.user.toString() === email
  );

  if (existingEmployee) {
    throw new Error('Employee already exists');
  }

  // Generate invitation token
  const invitationToken = crypto.randomBytes(32).toString('hex');

  this.employees.push({
    user: email, // Store email temporarily until user accepts
    role: role,
    department: department,
    position: position,
    status: 'pending',
    invitedAt: new Date(),
    invitedBy: invitedBy,
    invitationToken: invitationToken,
    invitationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    permissions: ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.employee
  });

  return this.save().then(() => invitationToken);
};

// Instance method to accept invitation
companySchema.methods.acceptInvitation = function (invitationToken, userId) {
  const employee = this.employees.find(emp =>
    emp.invitationToken === invitationToken &&
    emp.status === 'pending' &&
    emp.invitationExpires > new Date()
  );

  if (!employee) {
    throw new Error('Invalid or expired invitation');
  }

  employee.user = userId;
  employee.status = 'active';
  employee.invitationToken = undefined;
  employee.invitationExpires = undefined;
  employee.startDate = new Date();

  return this.save();
};

// Instance method to resend invitation
companySchema.methods.resendInvitation = function (employeeId) {
  const crypto = require('crypto');
  const employee = this.employees.id(employeeId);

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (employee.status !== 'pending') {
    throw new Error('Employee is not pending invitation');
  }

  employee.invitationToken = crypto.randomBytes(32).toString('hex');
  employee.invitationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return this.save().then(() => employee.invitationToken);
};

// Static method to get company statistics
companySchema.statics.getStatistics = function (ownerId) {
  return this.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(ownerId),
        status: 'active'
      }
    },
    {
      $group: {
        _id: null,
        totalCompanies: { $sum: 1 },
        totalEmployees: { $sum: { $size: '$employees' } },
        totalDepartments: { $sum: { $size: '$departments' } },
        totalBudget: { $sum: '$financial.totalBudget' },
        totalExpenses: { $sum: '$financial.totalExpenses' },
        totalRevenue: { $sum: '$financial.totalRevenue' }
      }
    }
  ]);
};

// Instance method to update department budget
companySchema.methods.updateDepartmentBudget = function (departmentId, budgetData) {
  const department = this.departments.id(departmentId);
  if (!department) {
    throw new Error('Department not found');
  }

  // Update budget fields
  if (budgetData.total !== undefined) {
    department.budget.total = budgetData.total;
  }
  if (budgetData.currency !== undefined) {
    department.budget.currency = budgetData.currency;
  }
  if (budgetData.alertThreshold !== undefined) {
    department.budget.alertThreshold = budgetData.alertThreshold;
  }
  if (budgetData.fiscalYear !== undefined) {
    department.budget.fiscalYear = budgetData.fiscalYear;
  }

  // Recalculate remaining budget
  department.budget.remaining = department.budget.total - department.budget.spent;
  department.budget.lastUpdated = new Date();

  return this.save();
};

// Instance method to add expense to department budget
companySchema.methods.addDepartmentExpense = function (departmentId, amount) {
  const department = this.departments.id(departmentId);
  if (!department) {
    throw new Error('Department not found');
  }

  department.budget.spent += amount;
  department.budget.remaining = department.budget.total - department.budget.spent;
  department.budget.lastUpdated = new Date();

  return this.save();
};

// Instance method to remove expense from department budget
companySchema.methods.removeDepartmentExpense = function (departmentId, amount) {
  const department = this.departments.id(departmentId);
  if (!department) {
    throw new Error('Department not found');
  }

  department.budget.spent = Math.max(0, department.budget.spent - amount);
  department.budget.remaining = department.budget.total - department.budget.spent;
  department.budget.lastUpdated = new Date();

  return this.save();
};

// Instance method to get department budget alerts
companySchema.methods.getDepartmentBudgetAlerts = function () {
  const alerts = [];

  this.departments.forEach(dept => {
    if (dept.budget.total > 0) {
      const utilizationPercentage = (dept.budget.spent / dept.budget.total) * 100;

      if (utilizationPercentage >= dept.budget.alertThreshold) {
        alerts.push({
          departmentId: dept._id,
          departmentName: dept.name,
          utilizationPercentage: Math.round(utilizationPercentage),
          spent: dept.budget.spent,
          total: dept.budget.total,
          remaining: dept.budget.remaining,
          currency: dept.budget.currency,
          alertType: utilizationPercentage >= 100 ? 'exceeded' : 'threshold',
          message: utilizationPercentage >= 100
            ? `Department "${dept.name}" has exceeded its budget`
            : `Department "${dept.name}" has reached ${Math.round(utilizationPercentage)}% of its budget`
        });
      }
    }
  });

  return alerts;
};

// Instance method to get department budget summary
companySchema.methods.getDepartmentBudgetSummary = function () {
  let totalBudget = 0;
  let totalSpent = 0;
  let totalRemaining = 0;
  let departmentsCount = 0;
  let overBudgetCount = 0;
  let nearLimitCount = 0;

  this.departments.forEach(dept => {
    if (dept.budget.total > 0) {
      totalBudget += dept.budget.total;
      totalSpent += dept.budget.spent;
      totalRemaining += dept.budget.remaining;
      departmentsCount++;

      const utilizationPercentage = (dept.budget.spent / dept.budget.total) * 100;
      if (utilizationPercentage >= 100) {
        overBudgetCount++;
      } else if (utilizationPercentage >= dept.budget.alertThreshold) {
        nearLimitCount++;
      }
    }
  });

  return {
    totalBudget,
    totalSpent,
    totalRemaining,
    departmentsCount,
    overBudgetCount,
    nearLimitCount,
    overallUtilization: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0
  };
};

module.exports = mongoose.model('Company', companySchema);
