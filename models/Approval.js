const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema({
  // Approval Information
  type: {
    type: String,
    required: true,
    enum: ['expense', 'project', 'budget', 'user_invitation', 'department_change', 'company_settings']
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Related Entity Information
  entityType: {
    type: String,
    required: true,
    enum: ['expense', 'revenue', 'project', 'department', 'employee', 'company']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // Company and Department Context
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  department: {
    type: String,
    required: false
  },

  // Requester Information
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestReason: {
    type: String,
    required: true,
    maxlength: 500
  },

  // Approval Workflow
  workflow: {
    type: String,
    enum: ['single_approval', 'multi_level', 'department_head', 'finance_team', 'management'],
    default: 'single_approval'
  },
  approvalSteps: [{
    step: {
      type: Number,
      required: true
    },
    approverRole: {
      type: String,
      required: true,
      enum: ['employee', 'accountant', 'supervisor', 'manager', 'admin', 'department_head', 'finance_team']
    },
    approverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false // Can be null if role-based
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'skipped'],
      default: 'pending'
    },
    comments: {
      type: String,
      maxlength: 500
    },
    approvedAt: {
      type: Date
    },
    deadline: {
      type: Date
    }
  }],

  // Financial Information (for expense approvals)
  amount: {
    type: Number,
    required: function () {
      return this.type === 'expense' || this.type === 'budget';
    }
  },
  currency: {
    type: String,
    default: 'EGP',
    enum: ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'LBP']
  },

  // Approval Limits and Rules
  approvalLimit: {
    type: Number,
    default: 0
  },
  requiresJustification: {
    type: Boolean,
    default: false
  },
  justification: {
    type: String,
    maxlength: 1000
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },

  // Notifications
  notificationsSent: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    type: {
      type: String,
      enum: ['email', 'push', 'in_app']
    },
    sentAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Attachments
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for better performance
approvalSchema.index({ company: 1, status: 1 });
approvalSchema.index({ requestedBy: 1, createdAt: -1 });
approvalSchema.index({ entityType: 1, entityId: 1 });
approvalSchema.index({ 'approvalSteps.approverId': 1, 'approvalSteps.status': 1 });

// Virtual for current step
approvalSchema.virtual('currentStep').get(function () {
  const pendingStep = this.approvalSteps.find(step => step.status === 'pending');
  return pendingStep ? pendingStep.step : null;
});

// Virtual for progress percentage
approvalSchema.virtual('progressPercentage').get(function () {
  if (this.approvalSteps.length === 0) return 0;
  const completedSteps = this.approvalSteps.filter(step =>
    step.status === 'approved' || step.status === 'rejected' || step.status === 'skipped'
  ).length;
  return Math.round((completedSteps / this.approvalSteps.length) * 100);
});

// Virtual for is overdue
approvalSchema.virtual('isOverdue').get(function () {
  const pendingStep = this.approvalSteps.find(step => step.status === 'pending');
  if (!pendingStep || !pendingStep.deadline) return false;
  return new Date() > pendingStep.deadline;
});

// Instance methods
approvalSchema.methods.canUserApprove = function (userId, userRole) {
  const pendingStep = this.approvalSteps.find(step => step.status === 'pending');
  if (!pendingStep) return false;

  // Check if user is the specific approver
  if (pendingStep.approverId && pendingStep.approverId.toString() === userId.toString()) {
    return true;
  }

  // Check if user has the required role
  return pendingStep.approverRole === userRole;
};

approvalSchema.methods.approveStep = function (userId, comments = '') {
  const pendingStep = this.approvalSteps.find(step => step.status === 'pending');
  if (!pendingStep) {
    throw new Error('No pending approval step found');
  }

  pendingStep.status = 'approved';
  pendingStep.comments = comments;
  pendingStep.approvedAt = new Date();

  // Check if all steps are completed
  const allStepsCompleted = this.approvalSteps.every(step =>
    step.status === 'approved' || step.status === 'rejected' || step.status === 'skipped'
  );

  if (allStepsCompleted) {
    this.status = 'approved';
    this.completedAt = new Date();
  }

  this.updatedAt = new Date();
  return this.save();
};

approvalSchema.methods.rejectStep = function (userId, comments = '') {
  const pendingStep = this.approvalSteps.find(step => step.status === 'pending');
  if (!pendingStep) {
    throw new Error('No pending approval step found');
  }

  pendingStep.status = 'rejected';
  pendingStep.comments = comments;
  pendingStep.approvedAt = new Date();

  this.status = 'rejected';
  this.completedAt = new Date();
  this.updatedAt = new Date();
  return this.save();
};

approvalSchema.methods.skipStep = function (userId, comments = '') {
  const pendingStep = this.approvalSteps.find(step => step.status === 'pending');
  if (!pendingStep) {
    throw new Error('No pending approval step found');
  }

  pendingStep.status = 'skipped';
  pendingStep.comments = comments;
  pendingStep.approvedAt = new Date();

  // Check if all steps are completed
  const allStepsCompleted = this.approvalSteps.every(step =>
    step.status === 'approved' || step.status === 'rejected' || step.status === 'skipped'
  );

  if (allStepsCompleted) {
    this.status = 'approved';
    this.completedAt = new Date();
  }

  this.updatedAt = new Date();
  return this.save();
};

approvalSchema.methods.addApprovalStep = function (step, approverRole, approverId = null, deadline = null) {
  this.approvalSteps.push({
    step,
    approverRole,
    approverId,
    status: 'pending',
    deadline: deadline ? new Date(deadline) : null
  });
  return this.save();
};

// Static methods
approvalSchema.statics.createExpenseApproval = function (expenseData, companyId, requestedBy, workflow = 'single_approval') {
  const approvalSteps = [];

  // Define approval workflow based on amount and company settings
  if (workflow === 'multi_level') {
    // Add steps based on amount thresholds
    if (expenseData.amount <= 1000) {
      approvalSteps.push({
        step: 1,
        approverRole: 'supervisor',
        status: 'pending'
      });
    } else if (expenseData.amount <= 5000) {
      approvalSteps.push({
        step: 1,
        approverRole: 'supervisor',
        status: 'pending'
      });
      approvalSteps.push({
        step: 2,
        approverRole: 'manager',
        status: 'pending'
      });
    } else {
      approvalSteps.push({
        step: 1,
        approverRole: 'supervisor',
        status: 'pending'
      });
      approvalSteps.push({
        step: 2,
        approverRole: 'manager',
        status: 'pending'
      });
      approvalSteps.push({
        step: 3,
        approverRole: 'admin',
        status: 'pending'
      });
    }
  } else {
    // Single approval
    approvalSteps.push({
      step: 1,
      approverRole: 'supervisor',
      status: 'pending'
    });
  }

  return this.create({
    type: 'expense',
    entityType: 'expense',
    entityId: expenseData._id,
    entityData: expenseData,
    company: companyId,
    department: expenseData.department,
    requestedBy: requestedBy,
    requestReason: expenseData.description || 'Expense approval request',
    workflow: workflow,
    approvalSteps: approvalSteps,
    amount: expenseData.amount,
    currency: expenseData.currency || 'EGP',
    approvalLimit: expenseData.amount
  });
};

approvalSchema.statics.createProjectApproval = function (projectData, companyId, requestedBy) {
  const approvalSteps = [
    {
      step: 1,
      approverRole: 'supervisor',
      status: 'pending'
    },
    {
      step: 2,
      approverRole: 'manager',
      status: 'pending'
    }
  ];

  return this.create({
    type: 'project',
    entityType: 'project',
    entityId: projectData._id,
    entityData: projectData,
    company: companyId,
    department: projectData.department,
    requestedBy: requestedBy,
    requestReason: `Project creation: ${projectData.name}`,
    workflow: 'multi_level',
    approvalSteps: approvalSteps,
    amount: projectData.budget?.total || 0,
    currency: projectData.budget?.currency || 'EGP'
  });
};

approvalSchema.statics.createBudgetApproval = function (budgetData, companyId, requestedBy, department) {
  const approvalSteps = [
    {
      step: 1,
      approverRole: 'manager',
      status: 'pending'
    },
    {
      step: 2,
      approverRole: 'admin',
      status: 'pending'
    }
  ];

  return this.create({
    type: 'budget',
    entityType: 'department',
    entityId: budgetData._id,
    entityData: budgetData,
    company: companyId,
    department: department,
    requestedBy: requestedBy,
    requestReason: `Budget change for ${department}`,
    workflow: 'multi_level',
    approvalSteps: approvalSteps,
    amount: budgetData.total,
    currency: budgetData.currency || 'EGP'
  });
};

// Pre-save middleware
approvalSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Approval', approvalSchema);
