const mongoose = require('mongoose');

const revenueSchema = new mongoose.Schema({
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
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },

  // Business Context
  type: {
    type: String,
    enum: ['personal', 'business', 'project'],
    default: 'personal',
    required: true
  },
  source: {
    type: String,
    enum: [
      'salary',
      'freelance',
      'business_income',
      'investment',
      'rental_income',
      'consulting',
      'sales',
      'commission',
      'bonus',
      'other'
    ],
    default: 'other'
  },

  // Client Information (for business revenues)
  client: {
    name: {
      type: String,
      trim: true,
      maxlength: [200, 'Client name cannot exceed 200 characters']
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true
    },
    company: {
      type: String,
      trim: true,
      maxlength: [200, 'Client company cannot exceed 200 characters']
    }
  },

  // Invoice Information
  invoice: {
    number: {
      type: String,
      trim: true,
      unique: true,
      sparse: true
    },
    date: Date,
    dueDate: Date,
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
      default: 'paid'
    },
    taxAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    totalAmount: {
      type: Number,
      min: 0
    },
    notes: {
      type: String,
      maxlength: [500, 'Invoice notes cannot exceed 500 characters']
    }
  },

  // Project Association (for contractors and companies)
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: function () {
      return this.type === 'project';
    }
  },

  // Company Association (for business revenues)
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: function () {
      return this.type === 'business';
    }
  },

  // Payment Information
  paymentMethod: {
    type: String,
    enum: [
      'cash',
      'bank_transfer',
      'credit_card',
      'check',
      'vodafone_cash',
      'instapay',
      'paypal',
      'other'
    ],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'received', 'overdue', 'cancelled'],
    default: 'received'
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paymentReference: {
    type: String,
    trim: true
  },

  // Recurring Revenue
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    type: String,
    enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
    required: function () {
      return this.isRecurring;
    }
  },
  recurringEndDate: Date,
  parentRevenue: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Revenue'
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
      description: String,
      client: String
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

  // Tags for better organization
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],

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
revenueSchema.index({ user: 1, date: -1 });
revenueSchema.index({ user: 1, category: 1 });
revenueSchema.index({ user: 1, type: 1 });
revenueSchema.index({ project: 1 });
revenueSchema.index({ company: 1 });
revenueSchema.index({ 'client.name': 1 });
// Note: invoice.number index is automatically created due to unique: true in schema
revenueSchema.index({ paymentStatus: 1 });
revenueSchema.index({ date: -1 });
revenueSchema.index({ amount: -1 });
revenueSchema.index({ isRecurring: 1, parentRevenue: 1 });

// Virtual for formatted amount
revenueSchema.virtual('formattedAmount').get(function () {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: this.currency
  }).format(this.amount);
});

// Virtual for revenue age in days
revenueSchema.virtual('ageInDays').get(function () {
  return Math.floor((Date.now() - this.date) / (1000 * 60 * 60 * 24));
});

// Virtual for is recent (within 7 days)
revenueSchema.virtual('isRecent').get(function () {
  return this.ageInDays <= 7;
});

// Virtual for is overdue
revenueSchema.virtual('isOverdue').get(function () {
  return this.paymentStatus === 'overdue' ||
    (this.invoice.dueDate && this.invoice.dueDate < new Date() && this.paymentStatus !== 'received');
});

// Pre-save middleware to validate project/company association
revenueSchema.pre('save', function (next) {
  if (this.type === 'project' && !this.project) {
    return next(new Error('Project is required for project-type revenues'));
  }
  if (this.type === 'business' && !this.company) {
    return next(new Error('Company is required for business-type revenues'));
  }
  next();
});

// Pre-save middleware to set default date to today if not provided
revenueSchema.pre('save', function (next) {
  if (!this.date) {
    this.date = new Date();
  }
  next();
});

// Pre-save middleware to calculate total amount including tax
revenueSchema.pre('save', function (next) {
  if (this.invoice.taxAmount && this.amount) {
    this.invoice.totalAmount = this.amount + this.invoice.taxAmount;
  }
  next();
});

// Instance method to check if revenue is approved
revenueSchema.methods.isApproved = function () {
  return this.approval.status === 'approved' || this.approval.status === 'not_required';
};

// Instance method to check if revenue needs approval
revenueSchema.methods.needsApproval = function () {
  return this.approval.status === 'pending';
};

// Instance method to approve revenue
revenueSchema.methods.approve = function (approvedBy, notes = '') {
  this.approval.status = 'approved';
  this.approval.approvedBy = approvedBy;
  this.approval.approvedAt = new Date();
  this.approval.notes = notes;
  return this.save();
};

// Instance method to reject revenue
revenueSchema.methods.reject = function (approvedBy, reason) {
  this.approval.status = 'rejected';
  this.approval.approvedBy = approvedBy;
  this.approval.approvedAt = new Date();
  this.approval.rejectionReason = reason;
  return this.save();
};

// Instance method to mark as received
revenueSchema.methods.markAsReceived = function (paymentReference = '') {
  this.paymentStatus = 'received';
  this.paymentDate = new Date();
  this.paymentReference = paymentReference;
  if (this.invoice.status === 'sent') {
    this.invoice.status = 'paid';
  }
  return this.save();
};

// Instance method to mark as overdue
revenueSchema.methods.markAsOverdue = function () {
  this.paymentStatus = 'overdue';
  if (this.invoice.status === 'sent') {
    this.invoice.status = 'overdue';
  }
  return this.save();
};

// Static method to find by user and date range
revenueSchema.statics.findByUserAndDateRange = function (userId, startDate, endDate) {
  return this.find({
    user: userId,
    date: { $gte: startDate, $lte: endDate },
    status: 'active'
  }).sort({ date: -1 });
};

// Static method to find by category
revenueSchema.statics.findByCategory = function (userId, category) {
  return this.find({
    user: userId,
    category: new RegExp(category, 'i'),
    status: 'active'
  }).sort({ date: -1 });
};

// Static method to find overdue revenues
revenueSchema.statics.findOverdue = function (userId) {
  return this.find({
    user: userId,
    $or: [
      { paymentStatus: 'overdue' },
      {
        'invoice.dueDate': { $lt: new Date() },
        paymentStatus: { $ne: 'received' }
      }
    ],
    status: 'active'
  }).sort({ 'invoice.dueDate': 1 });
};

// Static method to get monthly summary
revenueSchema.statics.getMonthlySummary = function (userId, year, month) {
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
revenueSchema.statics.getYearlySummary = function (userId, year) {
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

// Static method to find recurring revenues
revenueSchema.statics.findRecurring = function (userId) {
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

// Static method to get client summary
revenueSchema.statics.getClientSummary = function (userId) {
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        'client.name': { $exists: true, $ne: null },
        status: 'active'
      }
    },
    {
      $group: {
        _id: '$client.name',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        lastPayment: { $max: '$date' },
        averageAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
};

module.exports = mongoose.model('Revenue', revenueSchema);
