const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'User not found',
            arabic: 'المستخدم غير موجود',
            statusCode: 401
          }
        });
      }

      // Check if user is active
      if (!req.user.isActive) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Account is deactivated',
            arabic: 'الحساب معطل',
            statusCode: 401
          }
        });
      }

      // Check if user is blocked
      if (req.user.isBlocked) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Account is blocked',
            arabic: 'الحساب محظور',
            statusCode: 401
          }
        });
      }

      // Check if email is verified
      if (!req.user.isEmailVerified) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Please verify your email before accessing this resource',
            arabic: 'يرجى التحقق من بريدك الإلكتروني قبل الوصول إلى هذا المورد',
            statusCode: 401
          }
        });
      }

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(401).json({
        success: false,
        error: {
          message: 'Not authorized, token failed',
          arabic: 'غير مخول، فشل الرمز',
          statusCode: 401
        }
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Not authorized, no token',
        arabic: 'غير مخول، لا يوجد رمز',
        statusCode: 401
      }
    });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Not authorized',
          arabic: 'غير مخول',
          statusCode: 401
        }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `User role ${req.user.role} is not authorized to access this route`,
          arabic: `دور المستخدم ${req.user.role} غير مخول للوصول إلى هذا المسار`,
          statusCode: 403
        }
      });
    }

    next();
  };
};

// Check if user owns resource or has permission
const checkOwnership = (resourceUserField = 'user') => {
  return (req, res, next) => {
    // If user is owner of the resource, allow access
    if (req.resource && req.resource[resourceUserField].toString() === req.user._id.toString()) {
      return next();
    }

    // If user is company owner or has admin role, allow access
    if (req.user.role === 'company_owner' || req.user.role === 'supervisor') {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: {
        message: 'Not authorized to access this resource',
        arabic: 'غير مخول للوصول إلى هذا المورد',
        statusCode: 403
      }
    });
  };
};

// Check if user can edit resource
const checkEditPermission = (req, res, next) => {
  // Check user role permissions
  const canEditRoles = ['individual_user', 'partner_input', 'accountant', 'supervisor', 'company_owner'];

  if (!canEditRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Not authorized to edit this resource',
        arabic: 'غير مخول لتعديل هذا المورد',
        statusCode: 403
      }
    });
  }

  next();
};

// Check if user can view resource
const checkViewPermission = (req, res, next) => {
  // All authenticated users can view resources
  // Additional checks can be added based on business logic
  next();
};

// Check if user can delete resource
const checkDeletePermission = (req, res, next) => {
  // Check user role permissions
  const canDeleteRoles = ['individual_user', 'accountant', 'supervisor', 'company_owner'];

  if (!canDeleteRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Not authorized to delete this resource',
        arabic: 'غير مخول لحذف هذا المورد',
        statusCode: 403
      }
    });
  }

  next();
};

// Check if user can approve expenses
const checkApprovalPermission = (req, res, next) => {
  const canApproveRoles = ['accountant', 'supervisor', 'company_owner'];

  if (!canApproveRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Not authorized to approve expenses',
        arabic: 'غير مخول للموافقة على المصروفات',
        statusCode: 403
      }
    });
  }

  next();
};

// Check if user can manage projects
const checkProjectPermission = (req, res, next) => {
  // Check subscription plan instead of account type
  // Only paid plans (personal_plus, pro, company_plan) can access projects
  const paidPlans = ['personal_plus', 'pro', 'company_plan'];
  const userPlan = req.user?.subscription?.plan || 'free';

  if (!paidPlans.includes(userPlan)) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Projects feature requires a paid subscription plan',
        arabic: 'ميزة المشاريع تتطلب اشتراك مدفوع',
        statusCode: 403,
        requiresUpgrade: true
      }
    });
  }

  next();
};

// Check if user can manage companies
const checkCompanyPermission = (req, res, next) => {
  // Allow users with accountType 'company' to create companies
  // Allow users with company management roles to manage companies
  const canManageCompanyRoles = ['supervisor', 'company_owner'];
  const canCreateCompany = req.user.accountType === 'company' && req.method === 'POST';

  if (!canManageCompanyRoles.includes(req.user.role) && !canCreateCompany) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Not authorized to manage companies',
        arabic: 'غير مخول لإدارة الشركات',
        statusCode: 403
      }
    });
  }

  next();
};

// Check if user can manage users
const checkUserManagementPermission = (req, res, next) => {
  const canManageUserRoles = ['supervisor', 'company_owner'];

  if (!canManageUserRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Not authorized to manage users',
        arabic: 'غير مخول لإدارة المستخدمين',
        statusCode: 403
      }
    });
  }

  next();
};

// Check subscription plan
const checkSubscription = (requiredPlan) => {
  return (req, res, next) => {
    const planHierarchy = {
      'free': 0,
      'personal_plus': 1,
      'contractor_pro': 2,
      'company_plan': 3
    };

    const userPlanLevel = planHierarchy[req.user.subscription.plan] || 0;
    const requiredPlanLevel = planHierarchy[requiredPlan] || 0;

    if (userPlanLevel < requiredPlanLevel) {
      return res.status(403).json({
        success: false,
        error: {
          message: `This feature requires ${requiredPlan} subscription plan`,
          arabic: `هذه الميزة تتطلب خطة اشتراك ${requiredPlan}`,
          statusCode: 403
        }
      });
    }

    next();
  };
};

// Check if user's subscription is active
const checkActiveSubscription = (req, res, next) => {
  if (req.user.subscription.status !== 'active') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Subscription is not active',
        arabic: 'الاشتراك غير نشط',
        statusCode: 403
      }
    });
  }

  next();
};

module.exports = {
  protect,
  authorize,
  checkOwnership,
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
