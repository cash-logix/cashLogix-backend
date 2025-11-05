const express = require('express');
const router = express.Router();
const {
  createReceipt,
  createReceiptFromDashboard,
  claimReceipt,
  getEstablishmentReceipts,
  deductPoints,
} = require('../controllers/receiptController');
const { protectUser, protectEstablishment, protectEstablishmentAPI } = require('../middleware/auth');

// Establishment API routes (API Token)
router.post('/', protectEstablishmentAPI, createReceipt);

// Establishment routes (JWT Authentication)
router.post('/create', protectEstablishment, createReceiptFromDashboard);
router.get('/establishment', protectEstablishment, getEstablishmentReceipts);
router.post('/deduct-points', protectEstablishment, deductPoints);

// User routes
router.post('/claim', protectUser, claimReceipt);

module.exports = router;

