const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Supervisor = require('../models/Supervisor');

/* ==========================
   CONSTANTS & CONFIG
   ========================== */
const ROLES = {
  SUPERVISOR: 'supervisor',
  ADMIN: 'admin',
  COMPANY_OWNER: 'company_owner',
  ACCOUNTANT: 'accountant',
  PARTNER_INPUT: 'partner_input',
  INDIVIDUAL_USER: 'individual_user',
  COMPANY: 'company'
};

const PLANS = {
  FREE: 'free',
  PERSONAL_PLUS: 'personal_plus',
  CONTRACTOR_PRO: 'contractor_pro',
  PRO: 'pro',
  COMPANY_PLAN: 'company_plan'
};

const PLAN_LEVELS = {
  [PLANS.FREE]: 0,
  [PLANS.PERSONAL_PLUS]: 1,
  [PLANS.CONTRACTOR_PRO]: 2,
  [PLANS.PRO]: 2,
  [PLANS.COMPANY_PLAN]: 3
};

/* ==========================
   HELPER FUNCTIONS
   ========================== */
/**
 * Standardized Error Response Helper
 * Keeps code DRY and consistent across all middleware
 */
const sendError = (res, statusCode, message, arabic, extra = {}) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      arabic,
      statusCode,
      ...extra
    }
  });
};

/* ==========================
   MIDDLEWARE FUNCTIONS
   ========================== */

// Protect routes - verify JWT token (supports both users and supervisors)
const protect = async (req, res, next) => {
  // 1. Check Database Connection
  if (mongoose.connection.readyState !== 1) {
    console.error('Auth middleware error: MongoDB not connected');
    return sendError(res, 503,
      'Service temporarily unavailable - database connection issue',
      'الخدمة غير متاحة مؤقتاً - مشكلة في الاتصال بقاعدة البيانات'
    );
  }

  // 2. Extract Token
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return sendError(res, 401, 'Not authorized, no token', 'غير مخول، لا يوجد رمز');
  }

  try {
    // 3. Verify Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ==========================
    // CASE A: Supervisor Login
    // ==========================
    if (decoded.role === ROLES.SUPERVISOR && decoded.supervisorId) {
      const supervisor = await Supervisor.findById(decoded.supervisorId).select('-password');

      if (!supervisor) {
        return sendError(res, 401, 'Supervisor not found', 'المشرف غير موجود');
      }

      if (!supervisor.isActive) {
        return sendError(res, 401, 'Supervisor account is deactivated', 'حساب المشرف معطل');
      }

      const user = await User.findById(supervisor.user).select('-password');
      if (!user) {
        return sendError(res, 401, 'User not found', 'المستخدم غير موجود');
      }

      // Set context
      req.supervisor = supervisor;
      req.user = user;
      req.isSupervisor = true;

      return next();
    }

    // ==========================
    // CASE B: Regular User Login
    // ==========================
    req.isSupervisor = false;
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return sendError(res, 401, 'User not found', 'المستخدم غير موجود');
    }

    if (!user.isActive) {
      return sendError(res, 401, 'Account is deactivated', 'الحساب معطل');
    }

    if (user.isBlocked) {
      return sendError(res, 401, 'Account is blocked', 'الحساب محظور');
    }

    // Check email verification (Skip for Admins)
    const userIsAdmin = user.accountType === ROLES.ADMIN || user.role === ROLES.ADMIN;
    if (!userIsAdmin && !user.isEmailVerified) {
      return sendError(res, 401,
        'Please verify your email before accessing this resource',
        'يرجى التحقق من بريدك الإلكتروني قبل الوصول إلى هذا المورد'
      );
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    return sendError(res, 401, 'Not authorized, token failed', 'غير مخول، فشل الرمز');
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Not authorized', 'غير مخول');
    }

    if (!roles.includes(req.user.role)) {
      return sendError(res, 403,
        `User role ${req.user.role} is not authorized to access this route`,
        `دور المستخدم ${req.user.role} غير مخول للوصول إلى هذا المسار`
      );
    }
    next();
  };
};

// Check if user owns resource or has permission
const checkOwnership = (resourceUserField = 'user') => {
  return (req, res, next) => {
    // Owner access
    if (req.resource && req.resource[resourceUserField].toString() === req.user._id.toString()) {
      return next();
    }

    // Admin/Supervisor access
    if (req.user.role === ROLES.COMPANY_OWNER || req.user.role === ROLES.SUPERVISOR) {
      return next();
    }

    return sendError(res, 403, 'Not authorized to access this resource', 'غير مخول للوصول إلى هذا المورد');
  };
};

// Check if user can create resource
const checkCreatePermission = (req, res, next) => {
  if (req.isSupervisor) {
    return sendError(res, 403, 'Supervisors can only view resources, not create them', 'المشرفون يمكنهم فقط عرض الموارد، وليس إنشاءها');
  }

  const canCreateRoles = [ROLES.INDIVIDUAL_USER, ROLES.PARTNER_INPUT, ROLES.ACCOUNTANT, ROLES.COMPANY_OWNER];

  if (!canCreateRoles.includes(req.user.role)) {
    return sendError(res, 403, 'Not authorized to create this resource', 'غير مخول لإنشاء هذا المورد');
  }

  next();
};

// Check if user can edit resource
const checkEditPermission = (req, res, next) => {
  if (req.isSupervisor) {
    return sendError(res, 403, 'Supervisors can only view resources, not edit them', 'المشرفون يمكنهم فقط عرض الموارد، وليس تعديلها');
  }

  const canEditRoles = [ROLES.INDIVIDUAL_USER, ROLES.PARTNER_INPUT, ROLES.ACCOUNTANT, ROLES.COMPANY_OWNER];

  if (!canEditRoles.includes(req.user.role)) {
    return sendError(res, 403, 'Not authorized to edit this resource', 'غير مخول لتعديل هذا المورد');
  }

  next();
};

// Check if user can view resource
const checkViewPermission = (req, res, next) => {
  // Logic remains simple as originally designed: Allow everyone who is authenticated
  next();
};

// Check if user can delete resource
const checkDeletePermission = (req, res, next) => {
  if (req.isSupervisor) {
    return sendError(res, 403, 'Supervisors can only view resources, not delete them', 'المشرفون يمكنهم فقط عرض الموارد، وليس حذفها');
  }

  const canDeleteRoles = [ROLES.INDIVIDUAL_USER, ROLES.ACCOUNTANT, ROLES.COMPANY_OWNER];

  if (!canDeleteRoles.includes(req.user.role)) {
    return sendError(res, 403, 'Not authorized to delete this resource', 'غير مخول لحذف هذا المورد');
  }

  next();
};

// Check if user can approve expenses
const checkApprovalPermission = (req, res, next) => {
  const canApproveRoles = [ROLES.ACCOUNTANT, ROLES.SUPERVISOR, ROLES.COMPANY_OWNER];

  if (!canApproveRoles.includes(req.user.role)) {
    return sendError(res, 403, 'Not authorized to approve expenses', 'غير مخول للموافقة على المصروفات');
  }

  next();
};

// Check if user can manage projects
const checkProjectPermission = (req, res, next) => {
  // Check Active Free Trial
  const isInActiveFreeTrial = req.user?.subscription?.freeTrial?.isActive &&
    req.user?.subscription?.freeTrial?.endDate &&
    new Date() <= new Date(req.user.subscription.freeTrial.endDate);

  if (isInActiveFreeTrial) {
    return next();
  }

  // Check Paid Plans
  const paidPlans = [PLANS.PERSONAL_PLUS, PLANS.PRO, PLANS.COMPANY_PLAN]; // Note: 'pro' was in original code, kept it.
  const effectivePlan = req.user?.getEffectivePlan ? req.user.getEffectivePlan() : (req.user?.subscription?.plan || PLANS.FREE);

  if (!paidPlans.includes(effectivePlan)) {
    return sendError(res, 403,
      'Projects feature requires a paid subscription plan',
      'ميزة المشاريع تتطلب اشتراك مدفوع',
      {
        requiresUpgrade: true,
        isExpired: req.user?.isSubscriptionExpired || false
      }
    );
  }

  next();
};

// Check if user can manage companies
const checkCompanyPermission = (req, res, next) => {
  const canManageCompanyRoles = [ROLES.SUPERVISOR, ROLES.COMPANY_OWNER];
  const canCreateCompany = req.user.accountType === ROLES.COMPANY && req.method === 'POST';

  if (!canManageCompanyRoles.includes(req.user.role) && !canCreateCompany) {
    return sendError(res, 403, 'Not authorized to manage companies', 'غير مخول لإدارة الشركات');
  }

  next();
};

// Check if user can manage users
const checkUserManagementPermission = (req, res, next) => {
  const canManageUserRoles = [ROLES.SUPERVISOR, ROLES.COMPANY_OWNER];

  if (!canManageUserRoles.includes(req.user.role)) {
    return sendError(res, 403, 'Not authorized to manage users', 'غير مخول لإدارة المستخدمين');
  }

  next();
};

// Check subscription plan tier
const checkSubscription = (requiredPlan) => {
  return (req, res, next) => {
    const effectivePlan = req.user?.getEffectivePlan ? req.user.getEffectivePlan() : (req.user?.subscription?.plan || PLANS.FREE);
    const userPlanLevel = PLAN_LEVELS[effectivePlan] || 0;
    const requiredPlanLevel = PLAN_LEVELS[requiredPlan] || 0;

    if (userPlanLevel < requiredPlanLevel) {
      return sendError(res, 403,
        `This feature requires ${requiredPlan} subscription plan`,
        `هذه الميزة تتطلب خطة اشتراك ${requiredPlan}`,
        { isExpired: req.user?.isSubscriptionExpired || false }
      );
    }

    next();
  };
};

// Check if user's subscription is active
const checkActiveSubscription = (req, res, next) => {
  const isActive = req.user?.isSubscriptionActive ? req.user.isSubscriptionActive() :
    (req.user?.subscription?.status === 'active' && (!req.user?.subscription?.endDate || new Date() <= new Date(req.user.subscription.endDate)));

  if (!isActive) {
    return sendError(res, 403,
      'Subscription is not active',
      req.user?.isSubscriptionExpired ? 'انتهت صلاحية الاشتراك، يرجى التجديد' : 'الاشتراك غير نشط',
      { isExpired: req.user?.isSubscriptionExpired || false }
    );
  }

  next();
};

// Admin middleware
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 401, 'Not authorized', 'غير مخول');
  }

  const userIsAdmin = req.user.accountType === ROLES.ADMIN || req.user.role === ROLES.ADMIN;

  if (!userIsAdmin) {
    return sendError(res, 403, 'Admin access required', 'يتطلب الوصول كمسؤول');
  }

  next();
};

module.exports = {
  protect,
  authorize,
  isAdmin,
  checkOwnership,
  checkCreatePermission,
  checkEditPermission,
  checkViewPermission,
  checkDeletePermission,
  checkApprovalPermission,
  checkProjectPermission,
  checkCompanyPermission,
  checkUserManagementPermission,
  checkSubscription,
  checkActiveSubscription
};