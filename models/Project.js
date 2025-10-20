const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  // Project Information
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    maxlength: [200, 'Project name cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },

  // Project Owner
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Company Association (if project belongs to a company)
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },

  // Budget Information
  budget: {
    total: {
      type: Number,
      required: [true, 'Total budget is required'],
      min: [0, 'Budget must be positive']
    },
    currency: {
      type: String,
      default: 'EGP',
      enum: ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'LBP']
    },
    spent: {
      type: Number,
      default: 0,
      min: 0
    },
    remaining: {
      type: Number,
      default: 0
    }
  },

  // Timeline
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  actualStartDate: Date,
  actualEndDate: Date,

  // Project Status
  status: {
    type: String,
    enum: ['planning', 'active', 'in_progress', 'on_hold', 'completed', 'cancelled'],
    default: 'planning'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Partners/Collaborators
  partners: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['partner_input', 'partner_view'],
      required: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    acceptedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    },
    permissions: {
      canAddExpenses: {
        type: Boolean,
        default: function () {
          return this.role === 'partner_input';
        }
      },
      canAddRevenues: {
        type: Boolean,
        default: function () {
          return this.role === 'partner_input';
        }
      },
      canEditProject: {
        type: Boolean,
        default: false
      },
      canInvitePartners: {
        type: Boolean,
        default: false
      }
    }
  }],

  // Financial Tracking
  expenses: [{
    expense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense'
    },
    amount: Number,
    date: Date,
    category: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  revenues: [{
    revenue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Revenue'
    },
    amount: Number,
    date: Date,
    category: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // Project Categories/Tags
  categories: [{
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  }],
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],

  // Project Settings
  settings: {
    allowPartnerExpenses: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    autoApproveLimit: {
      type: Number,
      default: 0
    },
    notifications: {
      budgetAlerts: {
        type: Boolean,
        default: true
      },
      deadlineAlerts: {
        type: Boolean,
        default: true
      },
      partnerActivity: {
        type: Boolean,
        default: true
      }
    }
  },

  // Progress Tracking
  progress: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    milestones: [{
      name: {
        type: String,
        required: true,
        trim: true
      },
      description: String,
      dueDate: Date,
      completedDate: Date,
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'overdue'],
        default: 'pending'
      },
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },

  // Additional Information
  location: {
    name: String,
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  client: {
    name: String,
    contact: String,
    email: String,
    phone: String
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
projectSchema.index({ owner: 1, status: 1 });
projectSchema.index({ company: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ startDate: 1, endDate: 1 });
projectSchema.index({ 'partners.user': 1 });
projectSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate remaining budget
projectSchema.pre('save', function (next) {
  if (this.budget && this.budget.total !== undefined && this.budget.spent !== undefined) {
    this.budget.remaining = this.budget.total - this.budget.spent;
  }
  next();
});

// Virtual for project duration in days
projectSchema.virtual('duration').get(function () {
  if (this.actualStartDate && this.actualEndDate) {
    return Math.ceil((this.actualEndDate - this.actualStartDate) / (1000 * 60 * 60 * 24));
  }
  return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
});

// Virtual for days remaining
projectSchema.virtual('daysRemaining').get(function () {
  const now = new Date();
  if (this.status === 'completed' || this.status === 'cancelled') {
    return 0;
  }
  return Math.ceil((this.endDate - now) / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
projectSchema.virtual('isOverdue').get(function () {
  return this.status !== 'completed' && this.status !== 'cancelled' && this.endDate < new Date();
});

// Virtual for budget utilization percentage
projectSchema.virtual('budgetUtilization').get(function () {
  if (this.budget.total === 0) return 0;
  return Math.round((this.budget.spent / this.budget.total) * 100);
});

// Virtual for net profit/loss
projectSchema.virtual('netProfit').get(function () {
  const totalRevenue = (this.revenues || []).reduce((sum, rev) => sum + (rev.amount || 0), 0);
  return totalRevenue - (this.budget?.spent || 0);
});

// Pre-save middleware to calculate remaining budget
projectSchema.pre('save', function (next) {
  this.budget.remaining = this.budget.total - this.budget.spent;
  next();
});

// Pre-save middleware to validate dates
projectSchema.pre('save', function (next) {
  if (this.endDate <= this.startDate) {
    return next(new Error('End date must be after start date'));
  }
  next();
});

// Instance method to add partner
projectSchema.methods.addPartner = function (userId, role, invitedBy) {
  // Check if user is already a partner
  const existingPartner = this.partners.find(p => p.user.toString() === userId.toString());
  if (existingPartner) {
    throw new Error('User is already a partner in this project');
  }

  this.partners.push({
    user: userId,
    role: role,
    invitedBy: invitedBy,
    invitedAt: new Date(),
    status: 'pending'
  });

  return this.save();
};

// Instance method to remove partner
projectSchema.methods.removePartner = function (partnerId) {
  this.partners = this.partners.filter(p => p._id.toString() !== partnerId.toString());
  return this.save();
};

// Instance method to accept partner invitation
projectSchema.methods.acceptPartnerInvitation = function (userId) {
  const partner = this.partners.find(p => p.user.toString() === userId.toString());
  if (!partner) {
    throw new Error('Partner invitation not found');
  }
  if (partner.status !== 'pending') {
    throw new Error('Invitation is not pending');
  }

  partner.status = 'accepted';
  partner.acceptedAt = new Date();
  return this.save();
};

// Instance method to decline partner invitation
projectSchema.methods.declinePartnerInvitation = function (userId) {
  const partner = this.partners.find(p => p.user.toString() === userId.toString());
  if (!partner) {
    throw new Error('Partner invitation not found');
  }
  if (partner.status !== 'pending') {
    throw new Error('Invitation is not pending');
  }

  partner.status = 'declined';
  return this.save();
};

// Instance method to check if user is partner
projectSchema.methods.isPartner = function (userId) {
  return this.partners.some(p =>
    p.user.toString() === userId.toString() && p.status === 'accepted'
  );
};

// Instance method to check if user can view project
projectSchema.methods.canUserView = function (userId) {
  // Owner can always view - handle both populated and non-populated owner
  if (this.owner) {
    const ownerId = this.owner._id ? this.owner._id.toString() : this.owner.toString();
    if (ownerId === userId.toString()) {
      return true;
    }
  }

  // Check if user is an accepted partner
  if (this.partners && Array.isArray(this.partners)) {
    return this.partners.some(partner => {
      if (!partner.user) return false;
      const partnerUserId = partner.user._id ? partner.user._id.toString() : partner.user.toString();
      return partnerUserId === userId.toString() && partner.status === 'accepted';
    });
  }

  return false;
};

// Instance method to check if user can edit
projectSchema.methods.canUserEdit = function (userId) {
  // Owner can always edit - handle both populated and non-populated owner
  if (this.owner) {
    const ownerId = this.owner._id ? this.owner._id.toString() : this.owner.toString();
    if (ownerId === userId.toString()) {
      return true;
    }
  }

  const partner = this.partners.find(p => {
    if (!p.user) return false;
    const partnerUserId = p.user._id ? p.user._id.toString() : p.user.toString();
    return partnerUserId === userId.toString() && p.status === 'accepted';
  });

  return partner && partner.permissions && partner.permissions.canEditProject;
};

// Instance method to update budget spent
projectSchema.methods.updateBudgetSpent = function () {
  const totalExpenses = (this.expenses || []).reduce((sum, exp) => sum + (exp.amount || 0), 0);
  this.budget.spent = totalExpenses;
  this.budget.remaining = this.budget.total - this.budget.spent;
  return this.save();
};

// Instance method to add expense
projectSchema.methods.addExpense = function (expenseId, amount, category, addedBy) {
  // Initialize expenses array if it doesn't exist
  if (!this.expenses) {
    this.expenses = [];
  }

  this.expenses.push({
    expense: expenseId,
    amount: amount,
    date: new Date(),
    category: category,
    addedBy: addedBy
  });

  this.budget.spent += amount;
  this.budget.remaining = this.budget.total - this.budget.spent;

  return this.save();
};

// Instance method to add revenue
projectSchema.methods.addRevenue = function (revenueId, amount, category, addedBy) {
  // Initialize revenues array if it doesn't exist
  if (!this.revenues) {
    this.revenues = [];
  }

  this.revenues.push({
    revenue: revenueId,
    amount: amount,
    date: new Date(),
    category: category,
    addedBy: addedBy
  });

  return this.save();
};

// Instance method to get budget tracking
projectSchema.methods.getBudgetTracking = function () {
  const totalExpenses = (this.expenses || []).reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const totalRevenues = (this.revenues || []).reduce((sum, rev) => sum + (rev.amount || 0), 0);

  return {
    total: this.budget.total,
    spent: totalExpenses,
    remaining: this.budget.total - totalExpenses,
    revenue: totalRevenues,
    profit: totalRevenues - totalExpenses,
    currency: this.budget.currency,
    percentage: this.budget.total > 0 ? (totalExpenses / this.budget.total) * 100 : 0
  };
};

// Instance method to get analytics
projectSchema.methods.getAnalytics = function () {
  const totalExpenses = (this.expenses || []).reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const totalRevenues = (this.revenues || []).reduce((sum, rev) => sum + (rev.amount || 0), 0);

  // Category breakdown for expenses
  const expenseCategories = {};
  (this.expenses || []).forEach(exp => {
    if (exp.category) {
      expenseCategories[exp.category] = (expenseCategories[exp.category] || 0) + (exp.amount || 0);
    }
  });

  // Category breakdown for revenues
  const revenueCategories = {};
  (this.revenues || []).forEach(rev => {
    if (rev.category) {
      revenueCategories[rev.category] = (revenueCategories[rev.category] || 0) + (rev.amount || 0);
    }
  });

  return {
    budget: {
      total: this.budget.total,
      spent: totalExpenses,
      remaining: this.budget.total - totalExpenses,
      currency: this.budget.currency
    },
    financial: {
      totalExpenses,
      totalRevenues,
      profit: totalRevenues - totalExpenses,
      profitMargin: totalRevenues > 0 ? ((totalRevenues - totalExpenses) / totalRevenues) * 100 : 0
    },
    categories: {
      expenses: expenseCategories,
      revenues: revenueCategories
    },
    timeline: {
      startDate: this.startDate,
      endDate: this.endDate,
      duration: Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24)),
      daysRemaining: Math.ceil((this.endDate - new Date()) / (1000 * 60 * 60 * 24))
    },
    status: {
      current: this.status,
      priority: this.priority,
      progress: this.progress.percentage || 0
    }
  };
};

// Static method to find by owner
projectSchema.statics.findByOwner = function (ownerId) {
  return this.find({ owner: ownerId, isActive: true }).sort({ createdAt: -1 });
};

// Static method to find by partner
projectSchema.statics.findByPartner = function (userId) {
  return this.find({
    'partners.user': userId,
    'partners.status': 'accepted',
    isActive: true
  }).sort({ createdAt: -1 });
};

// Static method to find active projects
projectSchema.statics.findActive = function () {
  return this.find({
    status: { $in: ['planning', 'active'] },
    isActive: true
  }).sort({ createdAt: -1 });
};

// Static method to find overdue projects
projectSchema.statics.findOverdue = function () {
  return this.find({
    status: { $in: ['planning', 'active'] },
    endDate: { $lt: new Date() },
    isActive: true
  }).sort({ endDate: 1 });
};

// Static method to get project statistics
projectSchema.statics.getStatistics = function (ownerId) {
  return this.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(ownerId),
        isActive: true
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalBudget: { $sum: '$budget.total' },
        totalSpent: { $sum: '$budget.spent' }
      }
    }
  ]);
};

module.exports = mongoose.model('Project', projectSchema);
