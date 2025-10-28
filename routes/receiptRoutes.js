const express = require('express');
const router = express.Router();
const {
  createReceipt,
  claimReceipt,
  getEstablishmentReceipts,
  deductPoints,
} = require('../controllers/receiptController');
const { protectUser, protectEstablishment, protectEstablishmentAPI } = require('../middleware/auth');

// Establishment API routes
router.post('/', protectEstablishmentAPI, createReceipt);
router.get('/establishment', protectEstablishment, getEstablishmentReceipts);
router.post('/deduct-points', protectEstablishment, deductPoints);

// User routes
router.post('/claim', protectUser, claimReceipt);

module.exports = router;

