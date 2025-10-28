const User = require('../models/User');

/**
 * Subscription Service
 * Handles subscription limit checking and enforcement
 */

class SubscriptionService {
  /**
   * Check if user can perform an action and increment counter if allowed
   * @param {ObjectId} userId - User ID
   * @param {String} actionType - Type of action (voiceInput, expense, revenue, etc.)
   * @returns {Object} { allowed: Boolean, message: String, usage: Object }
   */
  static async checkAndIncrementLimit(userId, actionType) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return {
          allowed: false,
          message: 'User not found',
          usage: null
        };
      }

      // Check if user needs daily/monthly reset
      await this.checkAndResetCounters(user);

      // Check if action is allowed
      const canPerform = user.canPerformAction(actionType);
      const usage = user.getRemainingUsage(actionType);

      if (!canPerform) {
        const upgradeMessage = this.getUpgradeMessage(user.subscription.plan, actionType, usage);
        return {
          allowed: false,
          message: upgradeMessage,
          usage,
          currentPlan: user.subscription.plan
        };
      }

      // Increment usage counter
      await user.incrementUsage(actionType);

      // Refresh usage stats after increment
      const updatedUser = await User.findById(userId);
      const updatedUsage = updatedUser.getRemainingUsage(actionType);

      return {
        allowed: true,
        message: 'Action allowed',
        usage: updatedUsage,
        currentPlan: user.subscription.plan
      };
    } catch (error) {
      console.error('Error checking subscription limit:', error);
      throw error;
    }
  }

  /**
   * Check if user can perform action without incrementing
   * @param {ObjectId} userId - User ID
   * @param {String} actionType - Type of action
   * @returns {Object} { allowed: Boolean, message: String, usage: Object }
   */
  static async checkLimit(userId, actionType) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return {
          allowed: false,
          message: 'User not found',
          usage: null
        };
      }

      // Check if user needs daily/monthly reset
      await this.checkAndResetCounters(user);

      const canPerform = user.canPerformAction(actionType);
      const usage = user.getRemainingUsage(actionType);

      if (!canPerform) {
        const upgradeMessage = this.getUpgradeMessage(user.subscription.plan, actionType, usage);
        return {
          allowed: false,
          message: upgradeMessage,
          usage,
          currentPlan: user.subscription.plan
        };
      }

      return {
        allowed: true,
        message: 'Action allowed',
        usage,
        currentPlan: user.subscription.plan
      };
    } catch (error) {
      console.error('Error checking subscription limit:', error);
      throw error;
    }
  }

  /**
   * Decrement usage counter (used when deleting items)
   * @param {ObjectId} userId - User ID
   * @param {String} actionType - Type of action
   */
  static async decrementLimit(userId, actionType) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error('User not found');
      }

      await user.decrementUsage(actionType);
    } catch (error) {
      console.error('Error decrementing usage:', error);
      throw error;
    }
  }

  /**
   * Check and reset counters if needed
   * @param {User} user - User document
   */
  static async checkAndResetCounters(user) {
    const now = new Date();
    const updates = {};

    // Check daily counters
    const lastVoiceReset = new Date(user.usageTracking.daily.voiceInputs.lastReset);
    const lastExpenseReset = new Date(user.usageTracking.daily.expenses.lastReset);

    const oneDayMs = 24 * 60 * 60 * 1000;

    if (now - lastVoiceReset > oneDayMs) {
      updates['usageTracking.daily.voiceInputs.count'] = 0;
      updates['usageTracking.daily.voiceInputs.lastReset'] = now;
    }

    if (now - lastExpenseReset > oneDayMs) {
      updates['usageTracking.daily.expenses.count'] = 0;
      updates['usageTracking.daily.expenses.lastReset'] = now;
    }

    // Check monthly counters
    const lastRevenueReset = new Date(user.usageTracking.monthly.revenues.lastReset);
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000; // Approximate

    if (now - lastRevenueReset > oneMonthMs) {
      updates['usageTracking.monthly.revenues.count'] = 0;
      updates['usageTracking.monthly.revenues.lastReset'] = now;
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await user.updateOne({ $set: updates });
      // Reload user data
      Object.assign(user, await User.findById(user._id));
    }
  }

  /**
   * Get upgrade message based on plan and action
   * @param {String} currentPlan - Current subscription plan
   * @param {String} actionType - Type of action
   * @param {Object} usage - Current usage stats
   * @returns {String} Upgrade message
   */
  static getUpgradeMessage(currentPlan, actionType, usage) {
    const messages = {
      voiceInput: {
        free: `لقد وصلت إلى الحد اليومي لإدخال الصوت (${usage.limit} في اليوم). قم بالترقية إلى Personal Plus للحصول على 20 إدخال صوتي يوميًا أو Pro للإدخال غير المحدود.`,
        personal_plus: `لقد وصلت إلى الحد اليومي لإدخال الصوت (${usage.limit} في اليوم). قم بالترقية إلى Pro للحصول على إدخال صوتي غير محدود.`
      },
      expense: {
        free: `لقد وصلت إلى الحد اليومي للمصروفات (${usage.limit} في اليوم). قم بالترقية إلى Personal Plus للحصول على 50 مصروف يوميًا أو Pro للمصروفات غير المحدودة.`,
        personal_plus: `لقد وصلت إلى الحد اليومي للمصروفات (${usage.limit} في اليوم). قم بالترقية إلى Pro للحصول على مصروفات غير محدودة.`
      },
      revenue: {
        free: `لقد وصلت إلى الحد الشهري للإيرادات (${usage.limit} في الشهر). قم بالترقية إلى Personal Plus للحصول على 20 إيراد شهريًا أو Pro للإيرادات غير المحدودة.`,
        personal_plus: `لقد وصلت إلى الحد الشهري للإيرادات (${usage.limit} في الشهر). قم بالترقية إلى Pro للحصول على إيرادات غير محدودة.`
      },
      supervisor: {
        free: `الخطة المجانية لا تدعم المشرفين. قم بالترقية إلى Personal Plus للحصول على 3 مشرفين أو Pro لمشرفين غير محدودين.`,
        personal_plus: `لقد وصلت إلى الحد الأقصى للمشرفين (${usage.limit}). قم بالترقية إلى Pro للحصول على مشرفين غير محدودين.`
      },
      project: {
        free: `الخطة المجانية لا تدعم المشاريع. قم بالترقية إلى Pro للحصول على مشاريع غير محدودة.`,
        personal_plus: `الخطة Personal Plus لا تدعم المشاريع. قم بالترقية إلى Pro للحصول على مشاريع غير محدودة.`
      },
      partner: {
        free: `الخطة المجانية لا تدعم الشركاء. قم بالترقية إلى Pro للحصول على شركاء غير محدودين.`,
        personal_plus: `الخطة Personal Plus لا تدعم الشركاء. قم بالترقية إلى Pro للحصول على شركاء غير محدودين.`
      }
    };

    return messages[actionType]?.[currentPlan] ||
      `لقد وصلت إلى حد ${actionType}. قم بالترقية للحصول على المزيد من الميزات.`;
  }

  /**
   * Get user's subscription usage stats
   * @param {ObjectId} userId - User ID
   * @returns {Object} Usage statistics
   */
  static async getUserUsageStats(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Check and reset counters if needed
      await this.checkAndResetCounters(user);

      const limits = user.getSubscriptionLimits();

      return {
        plan: user.subscription.plan,
        limits,
        usage: {
          voiceInputs: user.getRemainingUsage('voiceInput'),
          expenses: user.getRemainingUsage('expense'),
          revenues: user.getRemainingUsage('revenue'),
          supervisors: user.getRemainingUsage('supervisor'),
          projects: user.getRemainingUsage('project'),
          partners: user.getRemainingUsage('partner')
        },
        subscription: user.getSubscriptionInfo()
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      throw error;
    }
  }

  /**
   * Upgrade user subscription
   * @param {ObjectId} userId - User ID
   * @param {String} newPlan - New subscription plan
   * @param {Number} durationMonths - Duration in months
   * @returns {Object} Updated user
   */
  static async upgradeSubscription(userId, newPlan, durationMonths = 1) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error('User not found');
      }

      const validPlans = ['free', 'personal_plus', 'pro', 'company_plan'];

      if (!validPlans.includes(newPlan)) {
        throw new Error('Invalid subscription plan');
      }

      // Calculate end date
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + durationMonths);

      // Update subscription
      user.subscription.plan = newPlan;
      user.subscription.status = 'active';
      user.subscription.startDate = startDate;
      user.subscription.endDate = newPlan === 'free' ? null : endDate;

      await user.save();

      return user;
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      throw error;
    }
  }

  /**
   * Get plan pricing information
   * @returns {Object} Pricing information for all plans
   */
  static getPlanPricing() {
    return {
      free: {
        name: 'مجاني',
        nameEn: 'Free',
        price: 0,
        currency: 'EGP',
        period: 'forever',
        features: {
          voiceInputsPerDay: 3,
          expensesPerDay: 5,
          revenuesPerMonth: 3,
          supervisors: 0,
          projects: 0,
          partners: 0
        }
      },
      personal_plus: {
        name: 'بلس شخصي',
        nameEn: 'Personal Plus',
        price: 49,
        currency: 'EGP',
        period: 'month',
        features: {
          voiceInputsPerDay: 20,
          expensesPerDay: 50,
          revenuesPerMonth: 20,
          supervisors: 3,
          projects: 0,
          partners: 0
        }
      },
      pro: {
        name: 'برو',
        nameEn: 'Pro',
        price: 99,
        currency: 'EGP',
        period: 'month',
        features: {
          voiceInputsPerDay: 'غير محدود',
          expensesPerDay: 'غير محدود',
          revenuesPerMonth: 'غير محدود',
          supervisors: 'غير محدود',
          projects: 'غير محدود',
          partners: 'غير محدود'
        }
      },
      company_plan: {
        name: 'الشركات',
        nameEn: 'Company',
        price: 'اتصل بنا',
        currency: 'EGP',
        period: 'custom',
        features: {
          voiceInputsPerDay: 'غير محدود',
          expensesPerDay: 'غير محدود',
          revenuesPerMonth: 'غير محدود',
          supervisors: 'غير محدود',
          projects: 'غير محدود',
          partners: 'غير محدود',
          customFeatures: true
        }
      }
    };
  }
}

module.exports = SubscriptionService;

