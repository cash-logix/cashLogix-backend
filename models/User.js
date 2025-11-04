const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  // Personal Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
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

  // Account Management
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  accountType: {
    type: String,
    enum: ['individual', 'contractor', 'company', 'admin'],
    default: 'individual',
    required: true
  },
  role: {
    type: String,
    enum: [
      'individual_user',
      'partner_input',
      'partner_view',
      'accountant',
      'supervisor',
      'company_owner',
      'admin'
    ],
    default: 'individual_user'
  },

  // Subscription Information
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'personal_plus', 'pro', 'company_plan'],
      default: 'free'
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
      default: false
    },
    paymentMethod: {
      type: String,
      enum: ['vodafone_cash', 'instapay', 'bank_transfer']
    },
    // Free trial information
    freeTrial: {
      isActive: {
        type: Boolean,
        default: false
      },
      startDate: Date,
      endDate: Date,
      used: {
        type: Boolean,
        default: false
      }
    }
  },

  // Usage Tracking for Subscription Limits
  usageTracking: {
    // Daily counters
    daily: {
      voiceInputs: {
        count: { type: Number, default: 0 },
        lastReset: { type: Date, default: Date.now }
      },
      expenses: {
        count: { type: Number, default: 0 },
        lastReset: { type: Date, default: Date.now }
      }
    },
    // Monthly counters
    monthly: {
      revenues: {
        count: { type: Number, default: 0 },
        lastReset: { type: Date, default: Date.now }
      }
    },
    // Total counters (no reset)
    total: {
      supervisors: { type: Number, default: 0 },
      projects: { type: Number, default: 0 },
      partners: { type: Number, default: 0 }
    }
  },

  // Company Information (for company accounts)
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false // Will be set after company creation
  },

  // Department/Team Information
  department: {
    type: String,
    trim: true
  },
  team: {
    type: String,
    trim: true
  },

  // User Preferences
  preferences: {
    language: {
      type: String,
      enum: ['ar', 'en'],
      default: 'ar'
    },
    currency: {
      type: String,
      default: 'EGP'
    },
    timezone: {
      type: String,
      default: 'Africa/Cairo'
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
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
      push: {
        type: Boolean,
        default: true
      },
      dailyReminder: {
        type: Boolean,
        default: true
      },
      budgetAlerts: {
        type: Boolean,
        default: true
      }
    }
  },

  // Security & Verification
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  lastVerificationEmailSent: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  // First login tracking
  firstLoginAfterVerification: {
    type: Boolean,
    default: true
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: String,

  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,

  // Profile Information
  avatar: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },
  dateOfBirth: Date,
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer_not_to_say']
  },

  // Partner Information (for contractors)
  partners: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['partner_input', 'partner_view']
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
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
// Note: email index is automatically created due to unique: true in schema
userSchema.index({ phone: 1 });
userSchema.index({ accountType: 1 });
userSchema.index({ 'subscription.plan': 1 });
userSchema.index({ company: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for account age
userSchema.virtual('accountAge').get(function () {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual to check if subscription is expired
userSchema.virtual('isSubscriptionExpired').get(function () {
  if (this.subscription.plan === 'free') return false;
  // If no endDate exists, treat as legacy subscription (still valid)
  if (!this.subscription.endDate) return false;
  return new Date() > this.subscription.endDate;
});

// Virtual to get days until subscription expires
userSchema.virtual('daysUntilExpiry').get(function () {
  if (this.subscription.plan === 'free' || !this.subscription.endDate) return null;
  const now = new Date();
  const expiry = new Date(this.subscription.endDate);
  const diffTime = expiry - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual to check if user is in free trial
userSchema.virtual('isInFreeTrial').get(function () {
  if (!this.subscription.freeTrial.isActive) return false;
  if (!this.subscription.freeTrial.endDate) return false;
  return new Date() <= this.subscription.freeTrial.endDate;
});

// Virtual to get days until free trial expires
userSchema.virtual('daysUntilTrialExpiry').get(function () {
  if (!this.subscription.freeTrial.isActive || !this.subscription.freeTrial.endDate) return null;
  const now = new Date();
  const expiry = new Date(this.subscription.freeTrial.endDate);
  const diffTime = expiry - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to set email verification token
userSchema.pre('save', function (next) {
  if (this.isNew && !this.emailVerificationToken) {
    this.emailVerificationToken = Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  }
  next();
});

// Pre-save middleware to handle subscription expiration
userSchema.pre('save', function (next) {
  // Check if subscription is expired and not already free
  if (this.subscription.plan !== 'free' &&
    this.subscription.endDate &&
    new Date() > this.subscription.endDate) {

    console.log(`🔄 Auto-downgrading user ${this.email} from ${this.subscription.plan} to free plan (subscription expired)`);

    // Downgrade to free plan
    this.subscription.plan = 'free';
    this.subscription.status = 'expired';
    this.subscription.endDate = null;
    this.subscription.autoRenew = false;
  }

  next();
});

// Pre-save middleware to start free trial for new users
userSchema.pre('save', function (next) {
  // Start free trial for new users who haven't used it yet
  if (this.isNew && !this.subscription.freeTrial.used) {
    console.log(`🎁 Starting free trial for new user ${this.email}`);

    this.subscription.freeTrial.isActive = true;
    this.subscription.freeTrial.startDate = new Date();

    // Set trial end date to 14 days from now
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14);
    this.subscription.freeTrial.endDate = trialEndDate;
  }

  // Check if free trial is expired
  if (this.subscription.freeTrial.isActive &&
    this.subscription.freeTrial.endDate &&
    new Date() > this.subscription.freeTrial.endDate) {

    console.log(`⏰ Free trial expired for user ${this.email}`);
    this.subscription.freeTrial.isActive = false;
    this.subscription.freeTrial.used = true;
  }

  next();
});

// Instance method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to generate JWT token
userSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      accountType: this.accountType,
      role: this.role
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Instance method to generate refresh token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );
};

// Instance method to check if account is locked
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Instance method to check subscription status
userSchema.methods.isSubscriptionActive = function () {
  // Check if user is in free trial
  if (this.isInFreeTrial) return true;

  if (this.subscription.plan === 'free') return true;

  // For paid plans: if no endDate exists (legacy users), treat as active if status is active
  if (!this.subscription.endDate) {
    return this.subscription.status === 'active';
  }

  return new Date() <= this.subscription.endDate && this.subscription.status === 'active';
};

// Instance method to check if user can create projects
userSchema.methods.canCreateProjects = function () {
  // Allow project creation during free trial
  if (this.isInFreeTrial) return true;

  return this.isSubscriptionActive() && this.subscription.plan !== 'free';
};

// Instance method to check if user can add partners
userSchema.methods.canAddPartners = function () {
  // Only Pro and Company plans can add partners
  return this.isSubscriptionActive() && ['pro', 'company_plan'].includes(this.subscription.plan);
};

// Instance method to check if user can use advanced features
userSchema.methods.canUseAdvancedFeatures = function () {
  return this.isSubscriptionActive() && ['pro', 'company_plan'].includes(this.subscription.plan);
};

// Get effective plan (free if expired, otherwise current plan)
userSchema.methods.getEffectivePlan = function () {
  // For free plan, always return free
  if (this.subscription.plan === 'free') return 'free';

  // Check if subscription has expired
  // If no endDate exists (legacy users), treat as still active
  if (this.subscription.endDate && this.isSubscriptionExpired) {
    return 'free';
  }

  return this.subscription.plan;
};

// Get subscription limits based on plan (checking expiry)
userSchema.methods.getSubscriptionLimits = function () {
  // Check if user is in an active free trial
  const isInActiveFreeTrial = this.subscription.freeTrial?.isActive &&
    this.subscription.freeTrial?.endDate &&
    new Date() < new Date(this.subscription.freeTrial.endDate);

  // If in active free trial, return unlimited limits (same as pro plan)
  if (isInActiveFreeTrial) {
    return {
      voiceInputsPerDay: Infinity,
      expensesPerDay: Infinity,
      revenuesPerMonth: Infinity,
      supervisors: Infinity,
      projects: Infinity,
      partners: Infinity
    };
  }

  // Get effective plan (considers expiry)
  const effectivePlan = this.getEffectivePlan();

  const limits = {
    free: {
      voiceInputsPerDay: 3,
      expensesPerDay: 5,
      revenuesPerMonth: 3,
      supervisors: 0,
      projects: 0,
      partners: 0
    },
    personal_plus: {
      voiceInputsPerDay: 20,
      expensesPerDay: 50,
      revenuesPerMonth: 20,
      supervisors: 1,
      projects: 0,
      partners: 0
    },
    pro: {
      voiceInputsPerDay: Infinity,
      expensesPerDay: Infinity,
      revenuesPerMonth: Infinity,
      supervisors: 3,
      projects: Infinity,
      partners: Infinity
    },
    company_plan: {
      voiceInputsPerDay: Infinity,
      expensesPerDay: Infinity,
      revenuesPerMonth: Infinity,
      supervisors: Infinity,
      projects: Infinity,
      partners: Infinity
    }
  };

  return limits[effectivePlan] || limits.free;
};

// Check if user can perform an action based on usage limits
userSchema.methods.canPerformAction = function (actionType) {
  const limits = this.getSubscriptionLimits();
  const usage = this.usageTracking;

  switch (actionType) {
    case 'voiceInput':
      return usage.daily.voiceInputs.count < limits.voiceInputsPerDay;
    case 'expense':
      return usage.daily.expenses.count < limits.expensesPerDay;
    case 'revenue':
      return usage.monthly.revenues.count < limits.revenuesPerMonth;
    case 'supervisor':
      return usage.total.supervisors < limits.supervisors;
    case 'project':
      return limits.projects === Infinity || usage.total.projects < limits.projects;
    case 'partner':
      return limits.partners === Infinity || usage.total.partners < limits.partners;
    default:
      return false;
  }
};

// Get remaining usage for a specific action
userSchema.methods.getRemainingUsage = function (actionType) {
  const limits = this.getSubscriptionLimits();
  const usage = this.usageTracking;

  switch (actionType) {
    case 'voiceInput':
      return {
        used: usage.daily.voiceInputs.count,
        limit: limits.voiceInputsPerDay,
        remaining: limits.voiceInputsPerDay === Infinity ? Infinity : limits.voiceInputsPerDay - usage.daily.voiceInputs.count
      };
    case 'expense':
      return {
        used: usage.daily.expenses.count,
        limit: limits.expensesPerDay,
        remaining: limits.expensesPerDay === Infinity ? Infinity : limits.expensesPerDay - usage.daily.expenses.count
      };
    case 'revenue':
      return {
        used: usage.monthly.revenues.count,
        limit: limits.revenuesPerMonth,
        remaining: limits.revenuesPerMonth === Infinity ? Infinity : limits.revenuesPerMonth - usage.monthly.revenues.count
      };
    case 'supervisor':
      return {
        used: usage.total.supervisors,
        limit: limits.supervisors,
        remaining: limits.supervisors === Infinity ? Infinity : limits.supervisors - usage.total.supervisors
      };
    case 'project':
      return {
        used: usage.total.projects,
        limit: limits.projects,
        remaining: limits.projects === Infinity ? Infinity : limits.projects - usage.total.projects
      };
    case 'partner':
      return {
        used: usage.total.partners,
        limit: limits.partners,
        remaining: limits.partners === Infinity ? Infinity : limits.partners - usage.total.partners
      };
    default:
      return { used: 0, limit: 0, remaining: 0 };
  }
};

// Increment usage counter for a specific action
userSchema.methods.incrementUsage = async function (actionType) {
  const updates = {};

  switch (actionType) {
    case 'voiceInput':
      updates['usageTracking.daily.voiceInputs.count'] = (this.usageTracking.daily.voiceInputs.count || 0) + 1;
      break;
    case 'expense':
      updates['usageTracking.daily.expenses.count'] = (this.usageTracking.daily.expenses.count || 0) + 1;
      break;
    case 'revenue':
      updates['usageTracking.monthly.revenues.count'] = (this.usageTracking.monthly.revenues.count || 0) + 1;
      break;
    case 'supervisor':
      updates['usageTracking.total.supervisors'] = (this.usageTracking.total.supervisors || 0) + 1;
      break;
    case 'project':
      updates['usageTracking.total.projects'] = (this.usageTracking.total.projects || 0) + 1;
      break;
    case 'partner':
      updates['usageTracking.total.partners'] = (this.usageTracking.total.partners || 0) + 1;
      break;
  }

  if (Object.keys(updates).length > 0) {
    await this.updateOne({ $set: updates });
  }
};

// Decrement usage counter for a specific action (when deleting)
userSchema.methods.decrementUsage = async function (actionType) {
  const updates = {};

  switch (actionType) {
    case 'supervisor':
      updates['usageTracking.total.supervisors'] = Math.max(0, (this.usageTracking.total.supervisors || 0) - 1);
      break;
    case 'project':
      updates['usageTracking.total.projects'] = Math.max(0, (this.usageTracking.total.projects || 0) - 1);
      break;
    case 'partner':
      updates['usageTracking.total.partners'] = Math.max(0, (this.usageTracking.total.partners || 0) - 1);
      break;
  }

  if (Object.keys(updates).length > 0) {
    await this.updateOne({ $set: updates });
  }
};

// Instance method to get subscription info
userSchema.methods.getSubscriptionInfo = function () {
  const isActive = this.isSubscriptionActive();
  const isExpired = this.isSubscriptionExpired;
  const daysUntilExpiry = this.daysUntilExpiry;
  const isInFreeTrial = this.isInFreeTrial;
  const daysUntilTrialExpiry = this.daysUntilTrialExpiry;

  return {
    plan: this.subscription.plan,
    status: this.subscription.status,
    isActive,
    isExpired,
    daysUntilExpiry,
    isInFreeTrial,
    daysUntilTrialExpiry,
    freeTrialUsed: this.subscription.freeTrial.used,
    startDate: this.subscription.startDate,
    endDate: this.subscription.endDate,
    canCreateProjects: this.canCreateProjects(),
    canAddPartners: this.canAddPartners(),
    canUseAdvancedFeatures: this.canUseAdvancedFeatures()
  };
};

// Instance method to increment login attempts
userSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return this.updateOne(updates);
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Static method to find by email
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find active users
userSchema.statics.findActive = function () {
  return this.find({ isActive: true, isBlocked: false });
};

// Static method to find by account type
userSchema.statics.findByAccountType = function (accountType) {
  return this.find({ accountType, isActive: true });
};

// Static method to find users with expired subscriptions
userSchema.statics.findExpiredSubscriptions = function () {
  return this.find({
    'subscription.plan': { $ne: 'free' },
    'subscription.endDate': { $lt: new Date() },
    'subscription.status': { $ne: 'expired' }
  });
};

// Static method to find users with subscriptions expiring soon (within X days)
userSchema.statics.findSubscriptionsExpiringSoon = function (days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    'subscription.plan': { $ne: 'free' },
    'subscription.endDate': {
      $gte: new Date(),
      $lte: futureDate
    },
    'subscription.status': 'active'
  });
};

// Static method to bulk update expired subscriptions
userSchema.statics.updateExpiredSubscriptions = async function () {
  try {
    const result = await this.updateMany(
      {
        'subscription.plan': { $ne: 'free' },
        'subscription.endDate': { $lt: new Date() },
        'subscription.status': { $ne: 'expired' }
      },
      {
        $set: {
          'subscription.plan': 'free',
          'subscription.status': 'expired',
          'subscription.endDate': null,
          'subscription.autoRenew': false
        }
      }
    );

    console.log(`🔄 Updated ${result.modifiedCount} expired subscriptions to free plan`);
    return result;
  } catch (error) {
    console.error('Error updating expired subscriptions:', error);
    throw error;
  }
};

// Static method to reset daily counters (voice inputs and expenses)
userSchema.statics.resetDailyCounters = async function () {
  try {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const result = await this.updateMany(
      {
        $or: [
          { 'usageTracking.daily.voiceInputs.lastReset': { $lt: oneDayAgo } },
          { 'usageTracking.daily.expenses.lastReset': { $lt: oneDayAgo } }
        ]
      },
      {
        $set: {
          'usageTracking.daily.voiceInputs.count': 0,
          'usageTracking.daily.voiceInputs.lastReset': new Date(),
          'usageTracking.daily.expenses.count': 0,
          'usageTracking.daily.expenses.lastReset': new Date()
        }
      }
    );

    console.log(`🔄 Reset daily counters for ${result.modifiedCount} users`);
    return result;
  } catch (error) {
    console.error('Error resetting daily counters:', error);
    throw error;
  }
};

// Static method to reset monthly counters (revenues)
userSchema.statics.resetMonthlyCounters = async function () {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const result = await this.updateMany(
      {
        'usageTracking.monthly.revenues.lastReset': { $lt: oneMonthAgo }
      },
      {
        $set: {
          'usageTracking.monthly.revenues.count': 0,
          'usageTracking.monthly.revenues.lastReset': new Date()
        }
      }
    );

    console.log(`🔄 Reset monthly counters for ${result.modifiedCount} users`);
    return result;
  } catch (error) {
    console.error('Error resetting monthly counters:', error);
    throw error;
  }
};

module.exports = mongoose.model('User', userSchema);
