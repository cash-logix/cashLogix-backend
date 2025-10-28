const Receipt = require('../models/Receipt');
const User = require('../models/User');
const Establishment = require('../models/Establishment');
const crypto = require('crypto');

// Helper function to generate random 8-character alphanumeric receipt ID
const generateReceiptId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // Removed confusing chars (0, O, I, 1, l)
  let receiptId = '';
  const randomBytes = crypto.randomBytes(8);

  for (let i = 0; i < 8; i++) {
    receiptId += chars[randomBytes[i] % chars.length];
  }

  return receiptId;
};

// @desc    Create receipt (for establishments via API)
// @route   POST /api/receipts
// @access  Private (Establishment API Token)
exports.createReceipt = async (req, res) => {
  try {
    const { amount, metadata } = req.body;
    const establishmentId = req.establishment._id;

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
      return res.status(500).json({ message: 'Failed to generate unique receipt ID. Please try again.' });
    }

    // Create receipt
    const receipt = await Receipt.create({
      receiptId,
      establishment: establishmentId,
      amount,
      metadata,
    });

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

    if (existingPoints) {
      existingPoints.amount += receipt.amount;
    } else {
      user.points.push({
        establishment: establishmentId,
        amount: receipt.amount,
      });
    }

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

    if (!userPoints || userPoints.amount < points) {
      return res.status(400).json({ message: req.t('points.insufficient_points') });
    }

    userPoints.amount -= points;
    await user.save();

    res.json({
      message: req.t('points.deducted_successfully'),
      pointsDeducted: points,
      remainingPoints: userPoints.amount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

