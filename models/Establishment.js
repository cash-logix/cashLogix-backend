const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const establishmentSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['restaurant', 'cafe', 'supermarket', 'bakery', 'other'],
    default: 'restaurant'
  },
  commercialName: {
    type: String,
    required: true,
    trim: true
  },
  logo: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  apiToken: {
    type: String,
    unique: true
  }
}, {
  timestamps: true
});

// Hash password before saving
establishmentSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
establishmentSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Establishment', establishmentSchema);

