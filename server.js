const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();
const mongoose = require('mongoose');

// Configs & Utils
const connectDB = require('./config/db');
const corsOptions = require('./config/corsOptions');
const logger = require('./utils/logger');
const { cacheService } = require('./utils/cache');

// Middleware
const errorHandler = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

// Routes Imports
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

// Scheduled Tasks
const setupScheduledTasks = require('./utils/scheduler');

const app = express();

// 1. Security & Optimization Middleware
app.use(helmet());
app.use(compression());
app.use(cors(corsOptions));

// 2. Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { skip: (req, res) => res.statusCode < 400 }));
}

// 3. Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Static Files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// 5. Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Cash Logix API is running',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 6. Routes Mounting
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

// 7. Error Handling (Must be last)
app.use(notFound);
app.use(errorHandler);

// Server Startup
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    setupScheduledTasks();

    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🌐 Environment: ${process.env.NODE_ENV}`);
    });

    // Graceful Shutdown
    const shutdown = async () => {
      logger.info('Graceful shutdown initiated...');

      server.close(async () => {
        logger.info('Http server closed.');

        try {
          await mongoose.connection.close();
          logger.info('MongoDB connection closed.');
          process.exit(0);
        } catch (err) {
          logger.error('Error during database shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;