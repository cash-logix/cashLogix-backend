const express = require('express');
const router = express.Router();
const {
  register,
  login,
  verifyEmail,
  resendActivation,
  forgotPassword,
  resetPassword,
} = require('../controllers/userAuthController');

router.post('/register', register);
router.post('/login', login);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-activation', resendActivation);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

module.exports = router;

