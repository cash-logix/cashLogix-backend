const User = require('../models/User');
const Establishment = require('../models/Establishment');
const Receipt = require('../models/Receipt');

// @desc    Get user dashboard
// @route   GET /api/dashboard/user
// @access  Private (User)
exports.getUserDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId)
      .populate('points.establishment', 'commercialName type logo')
      .select('-password');

    // Get claimed receipts
    const claimedReceipts = await Receipt.find({ claimedBy: userId })
      .populate('establishment', 'commercialName type')
      .sort({ claimedAt: -1 })
      .limit(10);

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
      },
      points: user.points,
      recentReceipts: claimedReceipts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get establishment dashboard
// @route   GET /api/dashboard/establishment
// @access  Private (Establishment)
exports.getEstablishmentDashboard = async (req, res) => {
  try {
    const establishmentId = req.establishment._id;

    // Get total receipts
    const totalReceipts = await Receipt.countDocuments({ establishment: establishmentId });
    const claimedReceipts = await Receipt.countDocuments({ establishment: establishmentId, claimed: true });
    const unclaimedReceipts = totalReceipts - claimedReceipts;

    // Get total points distributed
    const allReceipts = await Receipt.find({ establishment: establishmentId, claimed: true });
    const totalPointsDistributed = allReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

    // Get users with points from this establishment
    const usersWithPoints = await User.find({
      'points.establishment': establishmentId,
    }).select('name email mobile points');

    const userPointsList = usersWithPoints.map(user => {
      const establishmentPoints = user.points.find(
        p => p.establishment.toString() === establishmentId.toString()
      );
      return {
        userId: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        points: establishmentPoints ? establishmentPoints.amount : 0,
      };
    }).filter(u => u.points > 0);

    // Get recent receipts
    const recentReceipts = await Receipt.find({ establishment: establishmentId })
      .populate('claimedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      establishment: {
        id: req.establishment._id,
        commercialName: req.establishment.commercialName,
        type: req.establishment.type,
        email: req.establishment.email,
        phone: req.establishment.phone,
        logo: req.establishment.logo || '',
      },
      stats: {
        totalReceipts,
        claimedReceipts,
        unclaimedReceipts,
        totalPointsDistributed,
        totalUsers: userPointsList.length,
      },
      users: userPointsList,
      recentReceipts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get establishments list (for users)
// @route   GET /api/dashboard/establishments
// @access  Public
exports.getEstablishments = async (req, res) => {
  try {
    const establishments = await Establishment.find({ isVerified: true })
      .select('commercialName type logo')
      .sort({ commercialName: 1 });

    res.json({ establishments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Search user by mobile, email, name, or receipt ID (for establishments)
// @route   GET /api/dashboard/search-user
// @access  Private (Establishment)
exports.searchUser = async (req, res) => {
  try {
    const { query } = req.query;
    const establishmentId = req.establishment._id;

    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    // Search by user fields
    const users = await User.find({
      $or: [
        { email: { $regex: query, $options: 'i' } },
        { mobile: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } },
      ],
      'points.establishment': establishmentId,
    }).select('name email mobile points');

    let usersList = users.map(user => {
      const establishmentPoints = user.points.find(
        p => p.establishment.toString() === establishmentId.toString()
      );
      return {
        userId: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        points: establishmentPoints ? establishmentPoints.amount : 0,
      };
    });

    // If no users found by user fields, try searching by receipt ID
    if (usersList.length === 0) {
      const receipt = await Receipt.findOne({
        receiptId: { $regex: query, $options: 'i' },
        establishment: establishmentId,
        claimed: true,
      }).populate('claimedBy', 'name email mobile');

      if (receipt && receipt.claimedBy) {
        const user = await User.findById(receipt.claimedBy._id).select('name email mobile points');
        const establishmentPoints = user.points.find(
          p => p.establishment.toString() === establishmentId.toString()
        );

        if (establishmentPoints) {
          usersList = [{
            userId: user._id,
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            points: establishmentPoints.amount,
          }];
        }
      }
    }

    res.json({ users: usersList });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

