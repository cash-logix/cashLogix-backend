const cron = require('node-cron');
const mongoose = require('mongoose');
const logger = require('./logger');

const User = require('../models/User');
const checkExpiredFreeTrials = require('../scripts/checkExpiredFreeTrials');

const setupScheduledTasks = () => {
  // Check for expired free trials - runs every hour
  cron.schedule('0 * * * *', async () => {
    if (mongoose.connection.readyState !== 1) {
      logger.warn('⏰ Skipping scheduled task: MongoDB not connected');
      return;
    }
    logger.info('⏰ Running scheduled task: Check expired free trials');
    try {
      await checkExpiredFreeTrials();
    } catch (error) {
      logger.error('❌ Error in free trial check task:', error);
    }
  });

  // Check for expired subscriptions - runs every hour
  cron.schedule('0 * * * *', async () => {
    if (mongoose.connection.readyState !== 1) return;

    logger.info('⏰ Running scheduled task: Check expired subscriptions');
    try {
      await User.updateExpiredSubscriptions();
    } catch (error) {
      logger.error('❌ Error in subscription check task:', error);
    }
  });

  // Reset daily counters - runs at midnight (00:00) every day
  cron.schedule('0 0 * * *', async () => {
    if (mongoose.connection.readyState !== 1) return;

    logger.info('⏰ Running scheduled task: Reset daily counters');
    try {
      await User.resetDailyCounters();
    } catch (error) {
      logger.error('❌ Error in daily reset task:', error);
    }
  });

  // Reset monthly counters - runs at midnight on the 1st of each month
  cron.schedule('0 0 1 * *', async () => {
    if (mongoose.connection.readyState !== 1) return;

    logger.info('⏰ Running scheduled task: Reset monthly counters');
    try {
      await User.resetMonthlyCounters();
    } catch (error) {
      logger.error('❌ Error in monthly reset task:', error);
    }
  });

  logger.info('⏰ Scheduled tasks initialized successfully');
};

module.exports = setupScheduledTasks;