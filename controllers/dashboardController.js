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

    // Get unclaimed receipts by user's phone number
    let unclaimedReceipts = [];
    if (user.mobile && user.mobile.trim()) {
      unclaimedReceipts = await Receipt.find({
        customerPhone: user.mobile.trim(),
        claimed: false,
      })
        .populate('establishment', 'commercialName type logo')
        .sort({ createdAt: -1 });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
      },
      points: user.points,
      recentReceipts: claimedReceipts,
      unclaimedReceipts: unclaimedReceipts,
      unclaimedReceiptsCount: unclaimedReceipts.length,
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

// @desc    Get establishment profile (for users)
// @route   GET /api/dashboard/establishment/:id
// @access  Public
exports.getEstablishmentProfile = async (req, res) => {
  try {
    const establishmentId = req.params.id;

    const establishment = await Establishment.findOne({
      _id: establishmentId,
      isVerified: true,
    }).select('commercialName type logo email phone createdAt isVerified');

    if (!establishment) {
      return res.status(404).json({ message: 'Establishment not found' });
    }

    // Get analytics
    const totalReceipts = await Receipt.countDocuments({ establishment: establishmentId });
    const claimedReceipts = await Receipt.countDocuments({ establishment: establishmentId, claimed: true });
    const unclaimedReceipts = totalReceipts - claimedReceipts;

    // Get total points distributed
    const allReceipts = await Receipt.find({ establishment: establishmentId, claimed: true });
    const totalPointsDistributed = allReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

    // Get total users with points from this establishment
    const usersWithPoints = await User.find({
      'points.establishment': establishmentId,
    });
    const totalUsers = usersWithPoints.length;

    res.json({
      establishment: {
        id: establishment._id,
        commercialName: establishment.commercialName,
        type: establishment.type,
        email: establishment.email,
        phone: establishment.phone,
        logo: establishment.logo || '',
        createdAt: establishment.createdAt,
      },
      analytics: {
        totalReceipts,
        claimedReceipts,
        unclaimedReceipts,
        totalPointsDistributed,
        totalUsers,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get platform statistics (for landing page)
// @route   GET /api/dashboard/statistics
// @access  Public
exports.getStatistics = async (req, res) => {
  try {
    // Get total verified establishments
    const totalEstablishments = await Establishment.countDocuments();

    // Get total verified/active users
    const totalUsers = await User.countDocuments();

    // Get total points earned (sum of all claimed receipts)
    const claimedReceipts = await Receipt.find({ claimed: true });
    const totalPointsEarned = claimedReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

    res.json({
      totalEstablishments,
      totalUsers,
      totalPointsEarned,
    });
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

// @desc    Get points history for all users at establishment
// @route   GET /api/dashboard/points-history
// @access  Private (Establishment)
exports.getPointsHistory = async (req, res) => {
  try {
    const establishmentId = req.establishment._id;
    const { page = 1, limit = 50, userId, type } = req.query;

    // Build query to find users with points history from this establishment
    const query = {
      'pointsHistory.establishment': establishmentId,
    };

    if (userId) {
      query._id = userId;
    }

    // Get users with points history
    const users = await User.find(query)
      .select('name email mobile pointsHistory')
      .populate('pointsHistory.establishment', 'commercialName type logo')
      .populate('pointsHistory.receipt', 'receiptId amount');

    // Extract and filter history entries
    let allHistory = [];
    users.forEach((user) => {
      const establishmentHistory = user.pointsHistory
        .filter((entry) => {
          const entryEstablishmentId = entry.establishment._id
            ? entry.establishment._id.toString()
            : entry.establishment.toString();
          return entryEstablishmentId === establishmentId.toString();
        })
        .map((entry) => {
          const entryObj = entry.toObject ? entry.toObject() : entry;
          return {
            ...entryObj,
            user: {
              _id: user._id,
              name: user.name,
              email: user.email,
              mobile: user.mobile,
            },
          };
        });

      allHistory = allHistory.concat(establishmentHistory);
    });

    // Filter by type if provided
    if (type && (type === 'earned' || type === 'deducted')) {
      allHistory = allHistory.filter((entry) => entry.type === type);
    }

    // Sort by date (newest first)
    allHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const total = allHistory.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedHistory = allHistory.slice(startIndex, endIndex);

    res.json({
      history: paginatedHistory,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get receipts by phone number (for users)
// @route   GET /api/dashboard/user/receipts
// @access  Private (User)
exports.getUserReceipts = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('mobile');

    if (!user || !user.mobile) {
      return res.json({ receipts: [] });
    }

    // Find receipts by customer phone number
    const receipts = await Receipt.find({ customerPhone: user.mobile })
      .populate('establishment', 'commercialName type logo')
      .sort({ createdAt: -1 });

    res.json({ receipts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

