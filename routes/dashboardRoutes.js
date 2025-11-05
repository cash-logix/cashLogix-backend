const express = require('express');
const router = express.Router();
const {
  getUserDashboard,
  getEstablishmentDashboard,
  getEstablishments,
  getEstablishmentProfile,
  searchUser,
  getStatistics,
} = require('../controllers/dashboardController');
const { protectUser, protectEstablishment } = require('../middleware/auth');

// User routes
router.get('/user', protectUser, getUserDashboard);

// Public routes (must come before protected routes with similar paths)
router.get('/establishments', getEstablishments);
router.get('/establishment/:id', getEstablishmentProfile); // Public route for users to view establishment profiles
router.get('/statistics', getStatistics);

// Establishment routes (protected)
router.get('/establishment', protectEstablishment, getEstablishmentDashboard);
router.get('/search-user', protectEstablishment, searchUser);

module.exports = router;

