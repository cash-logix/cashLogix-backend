const dashboardController = require('../controllers/dashboardController'); // Adjust path
const User = require('../models/User');
const Establishment = require('../models/Establishment');
const Receipt = require('../models/Receipt');
const httpMocks = require('node-mocks-http');

// Mock Mongoose Models
jest.mock('../models/User');
jest.mock('../models/Establishment');
jest.mock('../models/Receipt');

describe('Dashboard Controller Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  // --- Test: getUserDashboard ---
  describe('getUserDashboard', () => {
    it('should return user dashboard data with valid user', async () => {
      req.user = { _id: 'user123' };

      const mockUser = {
        _id: 'user123',
        name: 'John Doe',
        email: 'john@example.com',
        mobile: '0123456789',
        points: []
      };

      // Mock Mongoose Chaining
      User.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser)
      });

      Receipt.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(), // For first call
        lean: jest.fn().mockResolvedValue([])
      });

      await dashboardController.getUserDashboard(req, res, next);

      expect(res.statusCode).toBe(200);
      const data = res._getJSONData();
      expect(data.user.name).toBe('John Doe');
      expect(User.findById).toHaveBeenCalledWith('user123');
    });
  });

  // --- Test: getEstablishmentDashboard ---
  describe('getEstablishmentDashboard', () => {
    it('should return establishment stats and users', async () => {
      req.establishment = {
        _id: 'est123',
        commercialName: 'Test Shop',
        type: 'Retail',
        email: 'shop@test.com',
        phone: '12345'
      };

      Receipt.countDocuments.mockResolvedValueOnce(100); // Total
      Receipt.countDocuments.mockResolvedValueOnce(80);  // Claimed
      Receipt.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ amount: 10 }, { amount: 20 }]) // For points calc
      });

      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'u1',
            points: [{ establishment: 'est123', amount: 50 }]
          }
        ])
      });

      await dashboardController.getEstablishmentDashboard(req, res, next);

      expect(res.statusCode).toBe(200);
      const data = res._getJSONData();
      expect(data.stats.totalReceipts).toBe(100);
      expect(data.stats.claimedReceipts).toBe(80);
      expect(data.stats.unclaimedReceipts).toBe(20);
      expect(data.users).toHaveLength(1);
    });
  });

  // --- Test: getEstablishments ---
  describe('getEstablishments', () => {
    it('should return list of verified establishments', async () => {
      Establishment.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ commercialName: 'Shop A' }])
      });

      await dashboardController.getEstablishments(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().establishments).toHaveLength(1);
    });
  });

  // --- Test: getEstablishmentProfile ---
  describe('getEstablishmentProfile', () => {
    it('should return 404 if establishment not found', async () => {
      req.params.id = 'invalid_id';
      Establishment.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      await dashboardController.getEstablishmentProfile(req, res, next);

      expect(res.statusCode).toBe(404);
      expect(res._getJSONData().message).toBe('Establishment not found');
    });

    it('should return profile and analytics if found', async () => {
      req.params.id = 'est123';
      Establishment.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: 'est123', commercialName: 'Shop' })
      });

      // Mock parallel calls
      Receipt.countDocuments.mockResolvedValue(10);
      Receipt.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });
      User.countDocuments.mockResolvedValue(5);

      await dashboardController.getEstablishmentProfile(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().establishment.commercialName).toBe('Shop');
    });
  });

  // --- Test: searchUser ---
  describe('searchUser', () => {
    it('should return 400 if no query provided', async () => {
      req.query = {};
      req.establishment = { _id: 'est123' };

      await dashboardController.searchUser(req, res, next);
      expect(res.statusCode).toBe(400);
    });

    it('should search users by details', async () => {
      req.query = { query: 'john' };
      req.establishment = { _id: 'est123' };

      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'u1',
            name: 'John',
            points: [{ establishment: 'est123', amount: 10 }]
          }
        ])
      });

      await dashboardController.searchUser(req, res, next);

      const data = res._getJSONData();
      expect(data.users).toHaveLength(1);
      expect(data.users[0].name).toBe('John');
    });
  });

  // --- Test: getPointsHistory ---
  describe('getPointsHistory', () => {
    it('should return paginated history', async () => {
      req.establishment = { _id: 'est123' };
      req.query = { page: 1, limit: 10 };

      const mockUser = {
        _id: 'u1',
        name: 'User 1',
        pointsHistory: [
          {
            establishment: { _id: 'est123' }, // Matches req
            type: 'earned',
            createdAt: new Date()
          },
          {
            establishment: { _id: 'other_est' }, // Should be filtered out
            type: 'earned'
          }
        ]
      };

      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(), // First populate
        populate: jest.fn().mockReturnThis(), // Second populate (chained)
        lean: jest.fn().mockResolvedValue([mockUser])
      });

      // We need to fix the chaining for the second populate call in the mock
      // Ideally, the mock return value should handle multiple chained calls.
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockUser])
      };
      User.find.mockReturnValue(mockChain);

      await dashboardController.getPointsHistory(req, res, next);

      const data = res._getJSONData();
      expect(data.history).toHaveLength(1); // Only the one matching est123
      expect(data.total).toBe(1);
    });
  });
});