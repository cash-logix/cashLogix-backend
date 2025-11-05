const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    trim: true,
    default: 'general'
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  establishment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Establishment',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create compound index for establishment and name
itemSchema.index({ establishment: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Item', itemSchema);

