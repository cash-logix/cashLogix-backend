const mongoose = require('mongoose');

const subscriptionRequestSchema = new mongoose.Schema({
  // User who requested the subscription
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Subscription details
  plan: {
    type: String,
    enum: ['personal_plus', 'pro', 'company_plan'],
    required: true
  },

  duration: {
    type: Number, // Number of months (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
    required: true,
    min: 1,
    max: 12
  },

  // Payment details
  paymentMethod: {
    type: String,
    enum: ['vodafone_cash', 'instapay'],
    required: true
  },

  // Payment information
  paymentInfo: {
    // For Vodafone Cash: the phone number used to send money
    // For Instapay: the username used to send money
    value: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['phone', 'username'],
      required: true
    }
  },

  // Transaction screenshot
  transactionScreenshot: {
    type: String, // URL or path to uploaded file
    default: null
  },

  // Calculated price
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  // Status of the request
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },

  // Admin notes
  adminNotes: {
    type: String,
    trim: true,
    default: null
  },

  // Approved/Rejected by
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Processing date
  processedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
subscriptionRequestSchema.index({ user: 1, status: 1 });
subscriptionRequestSchema.index({ status: 1, createdAt: -1 });

// Virtual for formatted payment info label
subscriptionRequestSchema.virtual('paymentInfoLabel').get(function () {
  if (this.paymentMethod === 'vodafone_cash') {
    return 'رقم فودافون كاش';
  }
  return 'اسم المستخدم في Instapay';
});

// Instance method to mark as approved
subscriptionRequestSchema.methods.approve = async function (adminId, notes = null) {
  this.status = 'approved';
  this.processedBy = adminId;
  this.processedAt = new Date();
  if (notes) {
    this.adminNotes = notes;
  }
  await this.save();
};

// Instance method to mark as rejected
subscriptionRequestSchema.methods.reject = async function (adminId, notes = null) {
  this.status = 'rejected';
  this.processedBy = adminId;
  this.processedAt = new Date();
  if (notes) {
    this.adminNotes = notes;
  }
  await this.save();
};

module.exports = mongoose.model('SubscriptionRequest', subscriptionRequestSchema);

