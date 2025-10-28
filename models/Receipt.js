const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  receiptId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  establishment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Establishment',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  claimed: {
    type: Boolean,
    default: false
  },
  claimedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  claimedAt: {
    type: Date
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Create compound index for receiptId and establishment
receiptSchema.index({ receiptId: 1, establishment: 1 }, { unique: true });

module.exports = mongoose.model('Receipt', receiptSchema);

