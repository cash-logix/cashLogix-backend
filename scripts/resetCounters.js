const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config({ path: '../.env' });

const User = require('../models/User');

/**
 * Scheduled Jobs for Subscription Counter Resets
 * 
 * This script runs scheduled tasks to:
 * 1. Reset daily counters (voice inputs and expenses) at midnight
 * 2. Reset monthly counters (revenues) on the 1st of each month
 * 3. Update expired subscriptions
 */

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected for scheduled jobs');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

/**
 * Reset daily counters (voice inputs and expenses)
 * Runs every day at midnight (00:00)
 */
const resetDailyCounters = async () => {
  try {
    console.log('🔄 Starting daily counter reset...');
    const result = await User.resetDailyCounters();
    console.log(`✅ Daily counters reset completed`);
  } catch (error) {
    console.error('❌ Error resetting daily counters:', error);
  }
};

/**
 * Reset monthly counters (revenues)
 * Runs on the 1st of each month at 00:00
 */
const resetMonthlyCounters = async () => {
  try {
    console.log('🔄 Starting monthly counter reset...');
    const result = await User.resetMonthlyCounters();
    console.log(`✅ Monthly counters reset completed`);
  } catch (error) {
    console.error('❌ Error resetting monthly counters:', error);
  }
};

/**
 * Update expired subscriptions
 * Runs every hour to check for and update expired subscriptions
 */
const updateExpiredSubscriptions = async () => {
  try {
    console.log('🔄 Checking for expired subscriptions...');
    const result = await User.updateExpiredSubscriptions();
    if (result.modifiedCount > 0) {
      console.log(`✅ Updated ${result.modifiedCount} expired subscriptions`);
    }
  } catch (error) {
    console.error('❌ Error updating expired subscriptions:', error);
  }
};

/**
 * Main function to set up and start scheduled jobs
 */
const startScheduledJobs = async () => {
  await connectDB();

  console.log('\n🕒 Setting up scheduled jobs...\n');

  // Daily reset at midnight (00:00)
  cron.schedule('0 0 * * *', () => {
    console.log('\n⏰ Running daily counter reset (midnight)...');
    resetDailyCounters();
  }, {
    timezone: process.env.TIMEZONE || 'Africa/Cairo'
  });
  console.log('✅ Daily reset job scheduled (00:00 daily)');

  // Monthly reset on 1st of each month at midnight
  cron.schedule('0 0 1 * *', () => {
    console.log('\n⏰ Running monthly counter reset (1st of month)...');
    resetMonthlyCounters();
  }, {
    timezone: process.env.TIMEZONE || 'Africa/Cairo'
  });
  console.log('✅ Monthly reset job scheduled (00:00 on 1st of each month)');

  // Check for expired subscriptions every hour
  cron.schedule('0 * * * *', () => {
    console.log('\n⏰ Checking for expired subscriptions...');
    updateExpiredSubscriptions();
  }, {
    timezone: process.env.TIMEZONE || 'Africa/Cairo'
  });
  console.log('✅ Expired subscription check scheduled (every hour)');

  // Run initial checks
  console.log('\n🔄 Running initial counter checks...');
  await resetDailyCounters();
  await resetMonthlyCounters();
  await updateExpiredSubscriptions();

  console.log('\n✨ All scheduled jobs are running!\n');
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down scheduled jobs...');
  await mongoose.connection.close();
  console.log('📦 Database connection closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down scheduled jobs...');
  await mongoose.connection.close();
  console.log('📦 Database connection closed.');
  process.exit(0);
});

// Start the jobs
if (require.main === module) {
  startScheduledJobs().catch(console.error);
}

module.exports = {
  resetDailyCounters,
  resetMonthlyCounters,
  updateExpiredSubscriptions,
  startScheduledJobs
};

