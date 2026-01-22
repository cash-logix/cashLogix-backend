const User = require('../models/User');
const Establishment = require('../models/Establishment');
const Receipt = require('../models/Receipt');

// --- Helper: Async Handler to remove try-catch repetition ---
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((error) => {
    res.status(500).json({ message: error.message });
  });

// --- Helper: Format User Response ---
const formatUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobile: user.mobile,
});

/**
 * @desc    Get user dashboard
 * @route   GET /api/dashboard/user
 * @access  Private (User)
 */
exports.getUserDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // optimize: Run independent queries in parallel
  const [user, claimedReceipts] = await Promise.all([
    User.findById(userId)
      .populate('points.establishment', 'commercialName type logo')
      .select('-password')
      .lean(),
    Receipt.find({ claimedBy: userId })
      .populate('establishment', 'commercialName type')
      .sort({ claimedAt: -1 })
      .limit(10)
      .lean(),
  ]);

  let unclaimedReceipts = [];
  if (user.mobile && user.mobile.trim()) {
    unclaimedReceipts = await Receipt.find({
      customerPhone: user.mobile.trim(),
      claimed: false,
    })
      .populate('establishment', 'commercialName type logo')
      .sort({ createdAt: -1 })
      .lean();
  }

  res.json({
    user: formatUserResponse(user),
    points: user.points,
    recentReceipts: claimedReceipts,
    unclaimedReceipts,
    unclaimedReceiptsCount: unclaimedReceipts.length,
  });
});

/**
 * @desc    Get establishment dashboard
 * @route   GET /api/dashboard/establishment
 * @access  Private (Establishment)
 */
exports.getEstablishmentDashboard = asyncHandler(async (req, res) => {
  const establishmentId = req.establishment._id;

  // optimize: Run aggregation and independent queries in parallel
  const [totalReceipts, claimedReceiptsCount, allClaimedReceipts, usersWithPoints, recentReceipts] = await Promise.all([
    Receipt.countDocuments({ establishment: establishmentId }),
    Receipt.countDocuments({ establishment: establishmentId, claimed: true }),
    Receipt.find({ establishment: establishmentId, claimed: true }).select('amount').lean(),
    User.find({ 'points.establishment': establishmentId })
      .select('name email mobile points')
      .lean(),
    Receipt.find({ establishment: establishmentId })
      .populate('claimedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const unclaimedReceipts = totalReceipts - claimedReceiptsCount;
  const totalPointsDistributed = allClaimedReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

  // Filter and map users efficiently
  const userPointsList = usersWithPoints
    .map((user) => {
      const establishmentPoints = user.points.find(
        (p) => p.establishment.toString() === establishmentId.toString()
      );
      return {
        userId: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        points: establishmentPoints ? establishmentPoints.amount : 0,
      };
    })
    .filter((u) => u.points > 0);

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
      claimedReceipts: claimedReceiptsCount,
      unclaimedReceipts,
      totalPointsDistributed,
      totalUsers: userPointsList.length,
    },
    users: userPointsList,
    recentReceipts,
  });
});

/**
 * @desc    Get establishments list (for users)
 * @route   GET /api/dashboard/establishments
 * @access  Public
 */
exports.getEstablishments = asyncHandler(async (req, res) => {
  const establishments = await Establishment.find({ isVerified: true })
    .select('commercialName type logo')
    .sort({ commercialName: 1 })
    .lean();

  res.json({ establishments });
});

/**
 * @desc    Get establishment profile (for users)
 * @route   GET /api/dashboard/establishment/:id
 * @access  Public
 */
exports.getEstablishmentProfile = asyncHandler(async (req, res) => {
  const establishmentId = req.params.id;

  const establishment = await Establishment.findOne({
    _id: establishmentId,
    isVerified: true,
  })
    .select('commercialName type logo email phone createdAt isVerified')
    .lean();

  if (!establishment) {
    return res.status(404).json({ message: 'Establishment not found' });
  }

  // optimize: Parallel execution
  const [totalReceipts, claimedReceiptsCount, allClaimedReceipts, usersWithPointsCount] = await Promise.all([
    Receipt.countDocuments({ establishment: establishmentId }),
    Receipt.countDocuments({ establishment: establishmentId, claimed: true }),
    Receipt.find({ establishment: establishmentId, claimed: true }).select('amount').lean(),
    User.countDocuments({ 'points.establishment': establishmentId }),
  ]);

  const unclaimedReceipts = totalReceipts - claimedReceiptsCount;
  const totalPointsDistributed = allClaimedReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

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
      claimedReceipts: claimedReceiptsCount,
      unclaimedReceipts,
      totalPointsDistributed,
      totalUsers: usersWithPointsCount,
    },
  });
});

/**
 * @desc    Get platform statistics (for landing page)
 * @route   GET /api/dashboard/statistics
 * @access  Public
 */
exports.getStatistics = asyncHandler(async (req, res) => {
  const [totalEstablishments, totalUsers, claimedReceipts] = await Promise.all([
    Establishment.countDocuments(),
    User.countDocuments(),
    Receipt.find({ claimed: true }).select('amount').lean(),
  ]);

  const totalPointsEarned = claimedReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

  res.json({
    totalEstablishments,
    totalUsers,
    totalPointsEarned,
  });
});

/**
 * @desc    Search user by mobile, email, name, or receipt ID
 * @route   GET /api/dashboard/search-user
 * @access  Private (Establishment)
 */
exports.searchUser = asyncHandler(async (req, res) => {
  const { query } = req.query;
  const establishmentId = req.establishment._id;

  if (!query) {
    return res.status(400).json({ message: 'Search query is required' });
  }

  const searchRegex = { $regex: query, $options: 'i' };

  // 1. Search by user fields
  const users = await User.find({
    $or: [{ email: searchRegex }, { mobile: searchRegex }, { name: searchRegex }],
    'points.establishment': establishmentId,
  })
    .select('name email mobile points')
    .lean();

  let usersList = users.map((user) => {
    const establishmentPoints = user.points.find(
      (p) => p.establishment.toString() === establishmentId.toString()
    );
    return {
      userId: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      points: establishmentPoints ? establishmentPoints.amount : 0,
    };
  });

  // 2. Search by Receipt ID if no user found
  if (usersList.length === 0) {
    const receipt = await Receipt.findOne({
      receiptId: searchRegex,
      establishment: establishmentId,
      claimed: true,
    })
      .populate('claimedBy', 'name email mobile points')
      .lean();

    if (receipt && receipt.claimedBy) {
      const user = receipt.claimedBy;
      const establishmentPoints = user.points.find(
        (p) => p.establishment.toString() === establishmentId.toString()
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
});

/**
 * @desc    Get points history for all users at establishment
 * @route   GET /api/dashboard/points-history
 * @access  Private (Establishment)
 */
exports.getPointsHistory = asyncHandler(async (req, res) => {
  const establishmentId = req.establishment._id;
  const { page = 1, limit = 50, userId, type } = req.query;

  const query = { 'pointsHistory.establishment': establishmentId };
  if (userId) query._id = userId;

  const users = await User.find(query)
    .select('name email mobile pointsHistory')
    .populate('pointsHistory.establishment', 'commercialName type logo')
    .populate('pointsHistory.receipt', 'receiptId amount')
    .lean();

  // In-memory processing (Required due to data structure, but safer with lean)
  let allHistory = [];

  for (const user of users) {
    const establishmentHistory = user.pointsHistory
      .filter((entry) => {
        const entryEstablishmentId = entry.establishment._id
          ? entry.establishment._id.toString()
          : entry.establishment.toString();
        return entryEstablishmentId === establishmentId.toString();
      })
      .map((entry) => ({
        ...entry,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
        },
      }));

    allHistory.push(...establishmentHistory);
  }

  // Filter by type
  if (type && ['earned', 'deducted'].includes(type)) {
    allHistory = allHistory.filter((entry) => entry.type === type);
  }

  // Sort
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
});

/**
 * @desc    Get receipts by phone number (for users)
 * @route   GET /api/dashboard/user/receipts
 * @access  Private (User)
 */
exports.getUserReceipts = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Use .lean() for faster lookup
  const user = await User.findById(userId).select('mobile').lean();

  if (!user || !user.mobile) {
    return res.json({ receipts: [] });
  }

  const receipts = await Receipt.find({ customerPhone: user.mobile })
    .populate('establishment', 'commercialName type logo')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ receipts });
});