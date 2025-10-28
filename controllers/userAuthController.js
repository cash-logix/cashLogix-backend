const crypto = require('crypto');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const ResponseHelper = require('../utils/responseHelper');

// @desc    Register user
// @route   POST /api/auth/user/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;
    const lang = req.language || 'en';

    // Check if user exists
    const userExists = await User.findOne({ $or: [{ email }, { mobile }] });

    if (userExists) {
      if (userExists.email === email) {
        return ResponseHelper.error(res, 'auth.email_already_exists', 400);
      }
      if (userExists.mobile === mobile) {
        return ResponseHelper.error(res, 'auth.phone_already_exists', 400);
      }
    }

    // Create verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create user
    const user = await User.create({
      name,
      email,
      mobile,
      password,
      verificationToken,
    });

    // Send verification email
    await sendVerificationEmail(email, verificationToken, lang, 'user');

    return ResponseHelper.success(res, 'auth.registered_successfully', {}, 201);
  } catch (error) {
    return ResponseHelper.serverError(res, error);
  }
};

// @desc    Login user
// @route   POST /api/auth/user/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user
    const user = await User.findOne({ email });

    if (!user) {
      return ResponseHelper.error(res, 'auth.invalid_credentials', 401);
    }

    // Check if email is verified
    if (!user.isVerified) {
      return ResponseHelper.error(res, 'auth.email_not_verified', 401);
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return ResponseHelper.error(res, 'auth.invalid_credentials', 401);
    }

    return ResponseHelper.success(res, 'auth.login_successful', {
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
      },
    });
  } catch (error) {
    return ResponseHelper.serverError(res, error);
  }
};

// @desc    Verify email
// @route   GET /api/auth/user/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return ResponseHelper.error(res, 'auth.invalid_token', 400);
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    return ResponseHelper.success(res, 'auth.email_verified');
  } catch (error) {
    return ResponseHelper.serverError(res, error);
  }
};

// @desc    Resend activation link
// @route   POST /api/auth/user/resend-activation
// @access  Public
exports.resendActivation = async (req, res) => {
  try {
    const { email } = req.body;
    const lang = req.language || 'en';

    const user = await User.findOne({ email });

    if (!user) {
      return ResponseHelper.error(res, 'auth.user_not_found', 404);
    }

    if (user.isVerified) {
      return ResponseHelper.error(res, 'auth.email_already_verified', 400);
    }

    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    await user.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken, lang, 'user');

    return ResponseHelper.success(res, 'auth.activation_link_sent');
  } catch (error) {
    return ResponseHelper.serverError(res, error);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/user/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const lang = req.language || 'en';

    const user = await User.findOne({ email });

    if (!user) {
      return ResponseHelper.error(res, 'auth.user_not_found', 404);
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email
    await sendPasswordResetEmail(email, resetToken, lang, 'user');

    return ResponseHelper.success(res, 'auth.password_reset_sent');
  } catch (error) {
    return ResponseHelper.serverError(res, error);
  }
};

// @desc    Reset password
// @route   POST /api/auth/user/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return ResponseHelper.error(res, 'auth.invalid_token', 400);
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return ResponseHelper.success(res, 'auth.password_reset_success');
  } catch (error) {
    return ResponseHelper.serverError(res, error);
  }
};

