const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const expenseRoutes = require('./routes/expenses');
const revenueRoutes = require('./routes/revenues');
const projectRoutes = require('./routes/projects');
const approvalRoutes = require('./routes/approvals');
const companyRoutes = require('./routes/companies');
const categoryRoutes = require('./routes/categories');
const adminRoutes = require('./routes/admin');
const subscriptionRoutes = require('./routes/subscription');
const supervisorRoutes = require('./routes/supervisors');
const supervisorAuthRoutes = require('./routes/supervisorAuth');
const subscriptionRequestRoutes = require('./routes/subscriptionRequests');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
// const limiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
//   max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
//   message: {
//     error: 'Too many requests from this IP, please try again later.',
//     arabic: 'طلبات كثيرة من هذا العنوان، يرجى المحاولة لاحقاً.'
//   }
// });
// app.use('/api/', limiter);

// CORS configuration
const isProduction = process.env.NODE_ENV === 'production';

// Base allowed origins - production domains
const productionOrigins = [
  'https://www.cash-logix.com',
  'https://cash-logix.com',
  'https://cash-logix.vercel.app'
];

// Development origins - localhost URLs
const developmentOrigins = [
  'http://localhost:5173', // Vite default port
  'http://localhost:5174', // Vite default port
  'http://localhost:3000'  // React default port
];

// Build allowed origins based on environment
let allowedOrigins = [...productionOrigins];

// Add FRONTEND_URL if set
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// In development, add localhost URLs
if (!isProduction) {
  allowedOrigins.push(...developmentOrigins);
  // If FRONTEND_URL is not set in development, add default localhost
  if (!process.env.FRONTEND_URL) {
    allowedOrigins.push('http://localhost:3000');
  }
}

// Filter out undefined values (in case FRONTEND_URL is not set)
const origins = allowedOrigins.filter(origin => origin);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In production, reject any localhost origins
    if (isProduction && origin.includes('localhost')) {
      console.warn(`🚫 CORS: Rejected localhost origin in production - ${origin}`);
      return callback(new Error('Localhost origins are not allowed in production'));
    }

    // Normalize origin by removing trailing slash
    const normalizedOrigin = origin.replace(/\/$/, '');

    // Check if the origin (with or without trailing slash) is in the allowed list
    const isAllowed = origins.some(allowedOrigin => {
      const normalizedAllowed = allowedOrigin.replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      // Log unauthorized origin attempts for debugging
      console.warn(`⚠️  CORS: Blocked origin - ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language']
}));

// Serve static files for uploads with CORS headers
// Use absolute path to ensure correct file resolution
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    // Set CORS headers for static files
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Cash Logix API is running',
    arabic: 'واجهة برمجة تطبيقات كاش لوجيكس تعمل بشكل طبيعي',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/revenues', revenueRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/subscription-requests', subscriptionRequestRoutes);
app.use('/api/supervisors', supervisorRoutes);
app.use('/api/supervisor-auth', supervisorAuthRoutes);

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);


// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT. Graceful shutdown...');
  await mongoose.connection.close();
  console.log('📦 Database connection closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM. Graceful shutdown...');
  await mongoose.connection.close();
  console.log('📦 Database connection closed.');
  process.exit(0);
});

// Scheduled tasks
const setupScheduledTasks = () => {
  // Import scheduled task functions
  const User = require('./models/User');
  const checkExpiredFreeTrials = require('./scripts/checkExpiredFreeTrials');

  // Check for expired free trials - runs every hour
  cron.schedule('0 * * * *', async () => {
    // Only run if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.log('⏰ Skipping scheduled task: MongoDB not connected');
      return;
    }
    console.log('⏰ Running scheduled task: Check expired free trials');
    try {
      await checkExpiredFreeTrials();
    } catch (error) {
      console.error('❌ Error in free trial check task:', error);
    }
  });

  // Check for expired subscriptions - runs every hour
  cron.schedule('0 * * * *', async () => {
    // Only run if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.log('⏰ Skipping scheduled task: MongoDB not connected');
      return;
    }
    console.log('⏰ Running scheduled task: Check expired subscriptions');
    try {
      await User.updateExpiredSubscriptions();
    } catch (error) {
      console.error('❌ Error in subscription check task:', error);
    }
  });

  // Reset daily counters - runs at midnight (00:00) every day
  cron.schedule('0 0 * * *', async () => {
    // Only run if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.log('⏰ Skipping scheduled task: MongoDB not connected');
      return;
    }
    console.log('⏰ Running scheduled task: Reset daily counters');
    try {
      await User.resetDailyCounters();
    } catch (error) {
      console.error('❌ Error in daily reset task:', error);
    }
  });

  // Reset monthly counters - runs at midnight on the 1st of each month
  cron.schedule('0 0 1 * *', async () => {
    // Only run if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.log('⏰ Skipping scheduled task: MongoDB not connected');
      return;
    }
    console.log('⏰ Running scheduled task: Reset monthly counters');
    try {
      await User.resetMonthlyCounters();
    } catch (error) {
      console.error('❌ Error in monthly reset task:', error);
    }
  });

  console.log('⏰ Scheduled tasks initialized:');
  console.log('   - Free trial expiration check: Every hour');
  console.log('   - Subscription expiration check: Every hour');
  console.log('   - Daily counter reset: Every day at midnight');
  console.log('   - Monthly counter reset: 1st of each month at midnight');
};

// Database connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.NODE_ENV === 'test'
      ? process.env.MONGODB_TEST_URI
      : process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }

    // Connection options for better reliability
    const options = {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    };

    await mongoose.connect(mongoURI, options);

    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
};

// Start server
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  try {
    // Connect to database first
    console.log('🔄 Connecting to MongoDB...');
    await connectDB();

    // Initialize scheduled tasks after DB connection
    setupScheduledTasks();

    // Start the server only after database is connected
    app.listen(PORT, () => {
      console.log('\n🚀 Cash Logix Backend Server Started!');
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📚 API Base URL: http://localhost:${PORT}/api`);
      console.log('\n📋 Available endpoints:');
      console.log('   POST /api/auth/register - User registration');
      console.log('   POST /api/auth/login - User login');
      console.log('   GET  /api/expenses - Get expenses');
      console.log('   POST /api/expenses - Create expense');
      console.log('   GET  /api/revenues - Get revenues');
      console.log('   POST /api/revenues - Create revenue');
      console.log('   GET  /api/projects - Get projects');
      console.log('   POST /api/projects - Create project');
      console.log('   GET  /api/companies - Get companies');
      console.log('   POST /api/companies - Create company');
      console.log('\n✨ Ready to handle requests!\n');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    console.error('💡 Make sure MongoDB is running and MONGODB_URI is set correctly');
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('❌ Unhandled Promise Rejection:', err.message);
  // Close server & exit process
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

startServer();

module.exports = app;
