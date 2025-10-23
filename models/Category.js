const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  // Category Information
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters'],
    unique: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },

  // Category Type
  type: {
    type: String,
    enum: ['predefined', 'custom'],
    default: 'custom',
    required: true
  },

  // User who created this category (for custom categories)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () {
      return this.type === 'custom';
    }
  },

  // Usage statistics
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  },

  // Category status
  isActive: {
    type: Boolean,
    default: true
  },

  // Category icon (optional)
  icon: {
    type: String,
    trim: true
  },

  // Category color (optional)
  color: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for better performance
categorySchema.index({ name: 1 });
categorySchema.index({ type: 1 });
categorySchema.index({ createdBy: 1 });
categorySchema.index({ isActive: 1 });

// Virtual for formatted name
categorySchema.virtual('formattedName').get(function () {
  return this.name;
});

// Method to increment usage count
categorySchema.methods.incrementUsage = function () {
  this.usageCount += 1;
  return this.save();
};

// Static method to get predefined categories
categorySchema.statics.getPredefinedCategories = function () {
  return [
    'طعام',
    'مواصلات',
    'تسوق',
    'ترفيه',
    'صحة وطب',
    'تعليم',
    'مرافق',
    'منزل',
    'عمل',
    'عناية شخصية',
    'تأمين',
    'سفر',
    'تكنولوجيا',
    'أخرى'
  ];
};

// Static method to get all categories (predefined + custom)
categorySchema.statics.getAllCategories = async function (userId = null) {
  const predefinedCategories = this.getPredefinedCategories();

  let customCategories = [];
  if (userId) {
    customCategories = await this.find({
      type: 'custom',
      createdBy: userId,
      isActive: true
    }).select('name description icon color');
  }

  // Combine predefined and custom categories
  const allCategories = [
    ...predefinedCategories,
    ...customCategories.map(cat => cat.name)
  ];

  return allCategories;
};

module.exports = mongoose.model('Category', categorySchema);
