const express = require('express');
const router = express.Router();
const {
  getUserDashboard,
  getEstablishmentDashboard,
  getEstablishments,
  searchUser,
} = require('../controllers/dashboardController');
const { protectUser, protectEstablishment } = require('../middleware/auth');

// User routes
router.get('/user', protectUser, getUserDashboard);

// Establishment routes
router.get('/establishment', protectEstablishment, getEstablishmentDashboard);
router.get('/search-user', protectEstablishment, searchUser);

// Public routes
router.get('/establishments', getEstablishments);

module.exports = router;

