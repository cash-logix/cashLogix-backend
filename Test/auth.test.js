const { protect } = require('../middleware/auth');
const httpMocks = require('node-mocks-http');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
// const mongoose = require('mongoose'); // مش محتاجين نعمل require هنا صراحة لو عاملين mock تحت

// ==========================================
// التعديل هنا: Mock Mongoose بشكل صحيح
// ==========================================
jest.mock('mongoose', () => {
  const originalMongoose = jest.requireActual('mongoose'); // بنجيب المكتبة الأصلية
  return {
    ...originalMongoose, // بنحافظ على كل حاجة فيها (Schema, Types, etc.)
    connection: {
      readyState: 1 // بنعدل حالة الاتصال بس عشان نخدع الـ middleware
    }
  };
});

jest.mock('jsonwebtoken');
jest.mock('../models/User'); // ده مهم عشان منروحش للداتا بيز بجد

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    process.env.JWT_SECRET = 'test_secret';
    jest.clearAllMocks(); // تنظيف الـ Mocks قبل كل تيست
  });

  it('should return 401 if no token provided', async () => {
    await protect(req, res, next);

    const data = res._getJSONData();
    expect(res.statusCode).toBe(401);
    expect(data.error.message).toBe('Not authorized, no token');
  });

  it('should call next() if token is valid and user exists', async () => {
    req.headers.authorization = 'Bearer valid_token';

    // Mock JWT decode
    jwt.verify.mockReturnValue({ id: 'user_123', role: 'individual_user' });

    // Mock User Query Result
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ // محاكاة .select('-password')
        _id: 'user_123',
        isActive: true,
        isBlocked: false,
        isEmailVerified: true,
        role: 'individual_user'
      })
    });

    await protect(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user._id).toBe('user_123');
  });

  it('should return 401 if user is blocked', async () => {
    req.headers.authorization = 'Bearer valid_token';
    jwt.verify.mockReturnValue({ id: 'user_123' });

    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'user_123',
        isActive: true,
        isBlocked: true // حالة الحظر
      })
    });

    await protect(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res._getJSONData().error.message).toBe('Account is blocked');
  });
});