const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Establishment = require('../models/Establishment');

// Protect user routes
exports.protectUser = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: req.t('auth.user_not_found') });
      }

      if (!req.user.isVerified) {
        return res.status(401).json({ message: req.t('auth.email_not_verified') });
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: req.t('auth.invalid_token') });
    }
  }

  if (!token) {
    return res.status(401).json({ message: req.t('establishment.unauthorized') });
  }
};

// Protect establishment routes
exports.protectEstablishment = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.establishment = await Establishment.findById(decoded.id).select('-password');

      if (!req.establishment) {
        return res.status(401).json({ message: req.t('establishment.not_found') });
      }

      if (!req.establishment.isVerified) {
        return res.status(401).json({ message: req.t('auth.email_not_verified') });
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: req.t('auth.invalid_token') });
    }
  }

  if (!token) {
    return res.status(401).json({ message: req.t('establishment.unauthorized') });
  }
};

// Protect establishment API routes (for receipt creation)
exports.protectEstablishmentAPI = async (req, res, next) => {
  const apiToken = req.headers['x-api-token'] || req.body.apiToken;

  if (!apiToken) {
    return res.status(401).json({ message: req.t('establishment.unauthorized') });
  }

  try {
    const establishment = await Establishment.findOne({ apiToken });

    if (!establishment) {
      return res.status(401).json({ message: req.t('establishment.unauthorized') });
    }

    if (!establishment.isVerified) {
      return res.status(401).json({ message: req.t('auth.email_not_verified') });
    }

    req.establishment = establishment;
    next();
  } catch (error) {
    return res.status(401).json({ message: req.t('establishment.unauthorized') });
  }
};

