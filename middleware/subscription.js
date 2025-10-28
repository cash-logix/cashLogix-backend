const SubscriptionService = require('../services/subscriptionService');

/**
 * Subscription Middleware
 * Checks subscription limits before allowing actions
 */

/**
 * Check subscription limit for a specific action
 * @param {String} actionType - Type of action to check
 */
const checkSubscriptionLimit = (actionType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;

      // Check if user can perform the action and increment counter
      const result = await SubscriptionService.checkAndIncrementLimit(userId, actionType);

      if (!result.allowed) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Subscription limit reached',
            arabic: result.message,
            code: 'SUBSCRIPTION_LIMIT_REACHED',
            currentPlan: result.currentPlan,
            usage: result.usage
          }
        });
      }

      // Attach usage info to request for logging/analytics
      req.subscriptionUsage = result.usage;
      req.subscriptionPlan = result.currentPlan;

      next();
    } catch (error) {
      console.error('Subscription middleware error:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Error checking subscription limits',
          arabic: 'حدث خطأ في التحقق من حدود الاشتراك',
          details: error.message
        }
      });
    }
  };
};

/**
 * Check subscription limit without incrementing (for read operations)
 * @param {String} actionType - Type of action to check
 */
const checkSubscriptionLimitNoIncrement = (actionType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;

      // Check if user can perform the action without incrementing
      const result = await SubscriptionService.checkLimit(userId, actionType);

      if (!result.allowed) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Subscription limit reached',
            arabic: result.message,
            code: 'SUBSCRIPTION_LIMIT_REACHED',
            currentPlan: result.currentPlan,
            usage: result.usage
          }
        });
      }

      // Attach usage info to request
      req.subscriptionUsage = result.usage;
      req.subscriptionPlan = result.currentPlan;

      next();
    } catch (error) {
      console.error('Subscription middleware error:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Error checking subscription limits',
          arabic: 'حدث خطأ في التحقق من حدود الاشتراك',
          details: error.message
        }
      });
    }
  };
};

/**
 * Middleware to attach subscription usage stats to request
 */
const attachSubscriptionStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const stats = await SubscriptionService.getUserUsageStats(userId);

    req.subscriptionStats = stats;
    next();
  } catch (error) {
    console.error('Error attaching subscription stats:', error);
    // Don't block the request, just log the error
    next();
  }
};

module.exports = {
  checkSubscriptionLimit,
  checkSubscriptionLimitNoIncrement,
  attachSubscriptionStats
};
