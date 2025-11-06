const Receipt = require('../models/Receipt');
const User = require('../models/User');
const Establishment = require('../models/Establishment');
const crypto = require('crypto');

// Helper function to generate random 8-digit receipt ID
const generateReceiptId = () => {
  const digits = '0123456789';
  let receiptId = '';
  const randomBytes = crypto.randomBytes(8);

  for (let i = 0; i < 8; i++) {
    receiptId += digits[randomBytes[i] % digits.length];
  }

  return receiptId;
};

// Shared function to create receipt
const createReceiptInternal = async (establishmentId, amount, metadata, customerPhone = '') => {
  // Generate unique receipt ID
  let receiptId;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    receiptId = generateReceiptId();
    const existingReceipt = await Receipt.findOne({ receiptId });
    if (!existingReceipt) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique receipt ID. Please try again.');
  }

  // Create receipt
  const receiptData = {
    receiptId,
    establishment: establishmentId,
    amount,
    metadata,
  };

  // Add customer phone if provided
  if (customerPhone && customerPhone.trim()) {
    receiptData.customerPhone = customerPhone.trim();
  }

  const receipt = await Receipt.create(receiptData);

  return receipt;
};

// @desc    Create receipt (for establishments via API)
// @route   POST /api/receipts
// @access  Private (Establishment API Token)
exports.createReceipt = async (req, res) => {
  try {
    const { amount, metadata, customerPhone } = req.body;
    const establishmentId = req.establishment._id;

    const receipt = await createReceiptInternal(establishmentId, amount, metadata, customerPhone);

    res.status(201).json({
      message: req.t('receipt.created_successfully'),
      receipt: {
        id: receipt._id,
        receiptId: receipt.receiptId,
        amount: receipt.amount,
        claimed: receipt.claimed,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create receipt from dashboard (for establishments via JWT)
// @route   POST /api/receipts/create
// @access  Private (Establishment)
exports.createReceiptFromDashboard = async (req, res) => {
  try {
    const { amount, metadata, customerPhone } = req.body;
    const establishmentId = req.establishment._id;

    const receipt = await createReceiptInternal(establishmentId, amount, metadata, customerPhone);

    res.status(201).json({
      message: req.t('receipt.created_successfully'),
      receipt: {
        id: receipt._id,
        receiptId: receipt.receiptId,
        amount: receipt.amount,
        claimed: receipt.claimed,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Claim points for receipt (for users)
// @route   POST /api/receipts/claim
// @access  Private (User)
exports.claimReceipt = async (req, res) => {
  try {
    const { receiptId, establishmentId } = req.body;
    const userId = req.user._id;

    // Find receipt
    const receipt = await Receipt.findOne({ receiptId, establishment: establishmentId });

    if (!receipt) {
      return res.status(404).json({ message: req.t('receipt.not_found') });
    }

    // Check if already claimed
    if (receipt.claimed) {
      return res.status(400).json({ message: req.t('receipt.already_claimed') });
    }

    // Mark receipt as claimed
    receipt.claimed = true;
    receipt.claimedBy = userId;
    receipt.claimedAt = Date.now();
    await receipt.save();

    // Add points to user
    const user = await User.findById(userId);
    const existingPoints = user.points.find(
      (p) => p.establishment.toString() === establishmentId
    );

    let balanceAfter;
    if (existingPoints) {
      existingPoints.amount = parseFloat((existingPoints.amount + receipt.amount).toFixed(2));
      balanceAfter = existingPoints.amount;
    } else {
      const newAmount = parseFloat(receipt.amount.toFixed(2));
      user.points.push({
        establishment: establishmentId,
        amount: newAmount,
      });
      balanceAfter = newAmount;
    }

    // Record points history
    user.pointsHistory.push({
      type: 'earned',
      amount: parseFloat(receipt.amount.toFixed(2)),
      establishment: establishmentId,
      receipt: receipt._id,
      description: `Points earned from receipt #${receipt.receiptId}`,
      balanceAfter: balanceAfter,
    });

    await user.save();

    res.json({
      message: req.t('receipt.points_added'),
      pointsAdded: receipt.amount,
      totalPoints: existingPoints ? existingPoints.amount : receipt.amount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all receipts for establishment
// @route   GET /api/receipts/establishment
// @access  Private (Establishment)
exports.getEstablishmentReceipts = async (req, res) => {
  try {
    const establishmentId = req.establishment._id;
    const { page = 1, limit = 20, claimed } = req.query;

    const query = { establishment: establishmentId };
    if (claimed !== undefined) {
      query.claimed = claimed === 'true';
    }

    const receipts = await Receipt.find(query)
      .populate('claimedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Receipt.countDocuments(query);

    res.json({
      receipts,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Deduct points (for establishments)
// @route   POST /api/receipts/deduct-points
// @access  Private (Establishment)
exports.deductPoints = async (req, res) => {
  try {
    const { userId, points } = req.body;
    const establishmentId = req.establishment._id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: req.t('user.not_found') });
    }

    const userPoints = user.points.find(
      (p) => p.establishment.toString() === establishmentId.toString()
    );

    const pointsToDeduct = parseFloat(points);

    if (!userPoints || userPoints.amount < pointsToDeduct) {
      return res.status(400).json({ message: req.t('points.insufficient_points') });
    }

    // Calculate balance after deduction
    const balanceAfter = parseFloat((userPoints.amount - pointsToDeduct).toFixed(2));
    userPoints.amount = balanceAfter;

    // Get establishment name for description
    const establishment = await Establishment.findById(establishmentId);
    const establishmentName = establishment ? establishment.commercialName : 'Establishment';

    // Record points history
    user.pointsHistory.push({
      type: 'deducted',
      amount: pointsToDeduct,
      establishment: establishmentId,
      description: `Points deducted by ${establishmentName}`,
      balanceAfter: balanceAfter,
    });

    await user.save();

    res.json({
      message: req.t('points.deducted_successfully'),
      pointsDeducted: pointsToDeduct,
      remainingPoints: balanceAfter,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get customer phone numbers by prefix (for establishments)
// @route   GET /api/receipts/customer-phones
// @access  Private (Establishment)
exports.getCustomerPhones = async (req, res) => {
  try {
    const establishmentId = req.establishment._id;
    const { prefix = '' } = req.query;

    // Build query to find receipts with customer phone numbers
    const query = {
      establishment: establishmentId,
      customerPhone: { $exists: true, $ne: '' },
    };

    // If prefix is provided, filter by phone numbers that start with it
    if (prefix.trim()) {
      query.customerPhone = { $regex: `^${prefix.trim()}`, $options: 'i' };
    }

    // Get unique customer phone numbers using distinct
    const uniquePhones = await Receipt.distinct('customerPhone', query);

    // Filter and sort phone numbers
    const filteredPhones = uniquePhones
      .filter(phone => phone && phone.trim() && phone.toString().startsWith(prefix.trim()))
      .sort()
      .slice(0, 10); // Limit to 10 suggestions

    res.json({ phones: filteredPhones });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

