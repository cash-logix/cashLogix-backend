// Subscription middleware for checking user subscription plans

/**
 * Check if user has a paid subscription plan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requirePaidPlan = (req, res, next) => {
  if (req.user.subscription.plan === 'free') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'This feature requires a paid subscription plan',
        arabic: 'هذه الميزة تتطلب خطة اشتراك مدفوعة',
        statusCode: 403,
        upgradeRequired: true
      }
    });
  }
  next();
};

/**
 * Check if user has contractor or company plan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireContractorPlan = (req, res, next) => {
  if (!['contractor_pro', 'company_plan'].includes(req.user.subscription.plan)) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'This feature requires contractor or company subscription plan',
        arabic: 'هذه الميزة تتطلب خطة اشتراك مقاول أو شركة',
        statusCode: 403,
        upgradeRequired: true
      }
    });
  }
  next();
};

/**
 * Check if user has company plan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireCompanyPlan = (req, res, next) => {
  if (req.user.subscription.plan !== 'company_plan') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'This feature requires company subscription plan',
        arabic: 'هذه الميزة تتطلب خطة اشتراك شركة',
        statusCode: 403,
        upgradeRequired: true
      }
    });
  }
  next();
};

/**
 * Get subscription plan limits
 * @param {String} plan - Subscription plan name
 * @returns {Object} Plan limits
 */
const getPlanLimits = (plan) => {
  const limits = {
    free: {
      maxProjects: 0,
      maxExpenses: 50,
      maxRevenues: 50,
      maxPartners: 0,
      features: ['basic_expense_tracking', 'basic_revenue_tracking']
    },
    personal_plus: {
      maxProjects: 3,
      maxExpenses: 200,
      maxRevenues: 200,
      maxPartners: 2,
      features: ['project_management', 'basic_reports', 'partner_collaboration']
    },
    contractor_pro: {
      maxProjects: 10,
      maxExpenses: 1000,
      maxRevenues: 1000,
      maxPartners: 5,
      features: ['advanced_project_management', 'advanced_reports', 'team_collaboration', 'client_management']
    },
    company_plan: {
      maxProjects: -1, // unlimited
      maxExpenses: -1, // unlimited
      maxRevenues: -1, // unlimited
      maxPartners: -1, // unlimited
      features: ['unlimited_projects', 'unlimited_transactions', 'advanced_analytics', 'multi_company_support', 'api_access']
    }
  };

  return limits[plan] || limits.free;
};

/**
 * Check if user has reached plan limits
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkPlanLimits = (resourceType) => {
  return async (req, res, next) => {
    try {
      const plan = req.user.subscription.plan;
      const limits = getPlanLimits(plan);

      // Skip limit check for unlimited plans
      if (limits[resourceType] === -1) {
        return next();
      }

      // Check current usage based on resource type
      let currentCount = 0;

      switch (resourceType) {
        case 'maxProjects':
          const Project = require('../models/Project');
          currentCount = await Project.countDocuments({
            owner: req.user.id,
            isActive: true
          });
          break;

        case 'maxExpenses':
          const Expense = require('../models/Expense');
          currentCount = await Expense.countDocuments({
            user: req.user.id,
            status: 'active'
          });
          break;

        case 'maxRevenues':
          const Revenue = require('../models/Revenue');
          currentCount = await Revenue.countDocuments({
            user: req.user.id,
            status: 'active'
          });
          break;

        case 'maxPartners':
          // This would need to be implemented based on your partner system
          currentCount = 0; // Placeholder
          break;
      }

      if (currentCount >= limits[resourceType]) {
        return res.status(403).json({
          success: false,
          error: {
            message: `You have reached the limit for ${resourceType.replace('max', '').toLowerCase()}`,
            arabic: `لقد وصلت إلى الحد المسموح لـ ${resourceType.replace('max', '').toLowerCase()}`,
            statusCode: 403,
            upgradeRequired: true,
            currentUsage: currentCount,
            limit: limits[resourceType]
          }
        });
      }

      next();
    } catch (error) {
      console.error('Plan limits check error:', error);
      next(error);
    }
  };
};

module.exports = {
  requirePaidPlan,
  requireContractorPlan,
  requireCompanyPlan,
  getPlanLimits,
  checkPlanLimits
};
