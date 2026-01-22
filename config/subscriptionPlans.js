/**
 * Subscription Plans Configuration
 * Centralizes all plan limits and features
 */

const PLANS = {
  FREE: 'free',
  PERSONAL_PLUS: 'personal_plus',
  PRO: 'pro',
  COMPANY: 'company_plan'
};

const LIMITS = {
  [PLANS.FREE]: {
    voiceInputsPerDay: 3,
    expensesPerDay: 5,
    revenuesPerMonth: 3,
    supervisors: 0,
    projects: 0,
    partners: 0
  },
  [PLANS.PERSONAL_PLUS]: {
    voiceInputsPerDay: 20,
    expensesPerDay: 50,
    revenuesPerMonth: 20,
    supervisors: 1,
    projects: 0,
    partners: 0
  },
  [PLANS.PRO]: {
    voiceInputsPerDay: Infinity,
    expensesPerDay: Infinity,
    revenuesPerMonth: Infinity,
    supervisors: 3,
    projects: Infinity,
    partners: Infinity
  },
  [PLANS.COMPANY]: {
    voiceInputsPerDay: Infinity,
    expensesPerDay: Infinity,
    revenuesPerMonth: Infinity,
    supervisors: Infinity,
    projects: Infinity,
    partners: Infinity
  }
};

module.exports = { PLANS, LIMITS };