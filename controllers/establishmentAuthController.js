const crypto = require('crypto');
const Establishment = require('../models/Establishment');
const generateToken = require('../utils/generateToken');
const generateApiToken = require('../utils/generateApiToken');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

// @desc    Register establishment
// @route   POST /api/auth/establishment/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { type, commercialName, email, phone, password } = req.body;
    const lang = req.language || 'en';

    // Check if establishment exists
    const establishmentExists = await Establishment.findOne({ $or: [{ email }, { phone }] });

    if (establishmentExists) {
      if (establishmentExists.email === email) {
        return res.status(400).json({ message: req.t('auth.email_already_exists') });
      }
      if (establishmentExists.phone === phone) {
        return res.status(400).json({ message: req.t('auth.phone_already_exists') });
      }
    }

    // Create verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Generate API token
    const apiToken = generateApiToken();

    // Create establishment
    const establishment = await Establishment.create({
      type,
      commercialName,
      email,
      phone,
      password,
      verificationToken,
      apiToken,
    });

    // Send verification email
    await sendVerificationEmail(email, verificationToken, lang, 'establishment');

    res.status(201).json({
      message: req.t('auth.registered_successfully'),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Login establishment
// @route   POST /api/auth/establishment/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for establishment
    const establishment = await Establishment.findOne({ email });

    if (!establishment) {
      return res.status(401).json({ message: req.t('auth.invalid_credentials') });
    }

    // Check if email is verified
    if (!establishment.isVerified) {
      return res.status(401).json({ message: req.t('auth.email_not_verified') });
    }

    // Check password
    const isMatch = await establishment.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: req.t('auth.invalid_credentials') });
    }

    res.json({
      message: req.t('auth.login_successful'),
      token: generateToken(establishment._id),
      establishment: {
        id: establishment._id,
        type: establishment.type,
        commercialName: establishment.commercialName,
        email: establishment.email,
        phone: establishment.phone,
        logo: establishment.logo,
        apiToken: establishment.apiToken,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Verify email
// @route   GET /api/auth/establishment/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const establishment = await Establishment.findOne({ verificationToken: token });

    if (!establishment) {
      return res.status(400).json({ message: req.t('auth.invalid_token') });
    }

    establishment.isVerified = true;
    establishment.verificationToken = undefined;
    await establishment.save();

    res.json({ message: req.t('auth.email_verified') });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Resend activation link
// @route   POST /api/auth/establishment/resend-activation
// @access  Public
exports.resendActivation = async (req, res) => {
  try {
    const { email } = req.body;
    const lang = req.language || 'en';

    const establishment = await Establishment.findOne({ email });

    if (!establishment) {
      return res.status(404).json({ message: req.t('establishment.not_found') });
    }

    if (establishment.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    establishment.verificationToken = verificationToken;
    await establishment.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken, lang, 'establishment');

    res.json({ message: req.t('auth.activation_link_sent') });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/establishment/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const lang = req.language || 'en';

    const establishment = await Establishment.findOne({ email });

    if (!establishment) {
      return res.status(404).json({ message: req.t('establishment.not_found') });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    establishment.resetPasswordToken = resetToken;
    establishment.resetPasswordExpire = Date.now() + 3600000; // 1 hour
    await establishment.save();

    // Send reset email
    await sendPasswordResetEmail(email, resetToken, lang, 'establishment');

    res.json({ message: req.t('auth.password_reset_sent') });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset password
// @route   POST /api/auth/establishment/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const establishment = await Establishment.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!establishment) {
      return res.status(400).json({ message: req.t('auth.invalid_token') });
    }

    establishment.password = password;
    establishment.resetPasswordToken = undefined;
    establishment.resetPasswordExpire = undefined;
    await establishment.save();

    res.json({ message: req.t('auth.password_reset_success') });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

