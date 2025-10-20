const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  // User Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Financial Data
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0']
  },
  currency: {
    type: String,
    default: 'EGP',
    enum: ['EGP', 'USD', 'EUR']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    maxlength: [100, 'Category cannot exceed 100 characters']
  },
  subcategory: {
    type: String,
    trim: true,
    maxlength: [100, 'Subcategory cannot exceed 100 characters']
  },
  description: {
    type: String,
    // required: [true, 'Description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },

  // Classification
  type: {
    type: String,
    enum: ['personal', 'business', 'project'],
    default: 'personal',
    required: true
  },
  paymentMethod: {
    type: String,
    enum: [
      'cash',
      'credit_card',
      'debit_card',
      'bank_transfer',
      'vodafone_cash',
      'instapay',
      'other'
    ],
    default: 'cash'
  },

  // Project Association (for contractors and companies)
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: function () {
      return this.type === 'project';
    }
  },

  // Company Association (for business expenses)
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: function () {
      return this.type === 'business';
    }
  },

  // Receipt Information
  receipt: {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },

  // AI Integration
  aiProcessing: {
    isVoiceInput: {
      type: Boolean,
      default: false
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 1
    },
    originalText: String,
    extractedData: {
      amount: Number,
      category: String,
      description: String
    },
    processedAt: Date
  },

  // Approval Workflow (for team environments)
  approval: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'not_required'],
      default: 'not_required'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    rejectionReason: String,
    notes: String
  },

  // Recurring Expense
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: function () {
      return this.isRecurring;
    }
  },
  recurringEndDate: Date,
  parentExpense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  },

  // Tags for better organization
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],

  // Location Information
  location: {
    name: String,
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active'
  },

  // Additional Notes
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ user: 1, category: 1 });
expenseSchema.index({ user: 1, type: 1 });
expenseSchema.index({ project: 1 });
expenseSchema.index({ company: 1 });
expenseSchema.index({ date: -1 });
expenseSchema.index({ amount: -1 });
expenseSchema.index({ 'approval.status': 1 });
expenseSchema.index({ isRecurring: 1, parentExpense: 1 });

// Virtual for formatted amount
expenseSchema.virtual('formattedAmount').get(function () {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: this.currency
  }).format(this.amount);
});

// Virtual for expense age in days
expenseSchema.virtual('ageInDays').get(function () {
  return Math.floor((Date.now() - this.date) / (1000 * 60 * 60 * 24));
});

// Virtual for is recent (within 7 days)
expenseSchema.virtual('isRecent').get(function () {
  return this.ageInDays <= 7;
});

// Pre-save middleware to validate project/company association
expenseSchema.pre('save', function (next) {
  if (this.type === 'project' && !this.project) {
    return next(new Error('Project is required for project-type expenses'));
  }
  if (this.type === 'business' && !this.company) {
    return next(new Error('Company is required for business-type expenses'));
  }
  next();
});

// Pre-save middleware to set default date to today if not provided
expenseSchema.pre('save', function (next) {
  if (!this.date) {
    this.date = new Date();
  }
  next();
});

// Instance method to check if expense is approved
expenseSchema.methods.isApproved = function () {
  return this.approval.status === 'approved' || this.approval.status === 'not_required';
};

// Instance method to check if expense needs approval
expenseSchema.methods.needsApproval = function () {
  return this.approval.status === 'pending';
};

// Instance method to approve expense
expenseSchema.methods.approve = function (approvedBy, notes = '') {
  this.approval.status = 'approved';
  this.approval.approvedBy = approvedBy;
  this.approval.approvedAt = new Date();
  this.approval.notes = notes;
  return this.save();
};

// Instance method to reject expense
expenseSchema.methods.reject = function (approvedBy, reason) {
  this.approval.status = 'rejected';
  this.approval.approvedBy = approvedBy;
  this.approval.approvedAt = new Date();
  this.approval.rejectionReason = reason;
  return this.save();
};

// Static method to find by user and date range
expenseSchema.statics.findByUserAndDateRange = function (userId, startDate, endDate) {
  return this.find({
    user: userId,
    date: { $gte: startDate, $lte: endDate },
    status: 'active'
  }).sort({ date: -1 });
};

// Static method to find by category
expenseSchema.statics.findByCategory = function (userId, category) {
  return this.find({
    user: userId,
    category: new RegExp(category, 'i'),
    status: 'active'
  }).sort({ date: -1 });
};

// Static method to get monthly summary
expenseSchema.statics.getMonthlySummary = function (userId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  return this.aggregate([
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
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        averageAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
};

// Static method to get yearly summary
expenseSchema.statics.getYearlySummary = function (userId, year) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);

  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate },
        status: 'active'
      }
    },
    {
      $group: {
        _id: {
          month: { $month: '$date' },
          category: '$category'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.month': 1, totalAmount: -1 }
    }
  ]);
};

// Static method to find recurring expenses
expenseSchema.statics.findRecurring = function (userId) {
  return this.find({
    user: userId,
    isRecurring: true,
    status: 'active',
    $or: [
      { recurringEndDate: { $exists: false } },
      { recurringEndDate: { $gt: new Date() } }
    ]
  }).sort({ date: -1 });
};

module.exports = mongoose.model('Expense', expenseSchema);
