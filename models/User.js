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
    enum: ['individual', 'contractor', 'company'],
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
      'company_owner'
    ],
    default: 'individual_user'
  },

  // Subscription Information
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'personal_plus', 'contractor_pro', 'company_plan'],
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
userSchema.index({ email: 1 });
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

module.exports = mongoose.model('User', userSchema);
