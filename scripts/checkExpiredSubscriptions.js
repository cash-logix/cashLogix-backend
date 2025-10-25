#!/usr/bin/env node

/**
 * Cron job script to check and update expired subscriptions
 * This script should be run daily to automatically downgrade expired subscriptions
 * Usage: node scripts/checkExpiredSubscriptions.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const checkExpiredSubscriptions = async () => {
  try {
    console.log('🔄 Starting expired subscription check...');

    // Connect to MongoDB
    const mongoURI = process.env.NODE_ENV === 'test'
      ? process.env.MONGODB_TEST_URI
      : process.env.MONGODB_URI;

    if (!mongoURI) {
      console.error('❌ MONGODB_URI not found in environment variables');
      process.exit(1);
    }

    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Find users with expired subscriptions
    const expiredUsers = await User.findExpiredSubscriptions();
    console.log(`📊 Found ${expiredUsers.length} users with expired subscriptions`);

    if (expiredUsers.length === 0) {
      console.log('✅ No expired subscriptions found');
      await mongoose.disconnect();
      return;
    }

    // Update expired subscriptions
    const result = await User.updateExpiredSubscriptions();

    console.log(`✅ Successfully updated ${result.modifiedCount} expired subscriptions`);

    // Log details of updated users
    for (const user of expiredUsers) {
      console.log(`   - ${user.email}: ${user.subscription.plan} → free`);
    }

    // Find users with subscriptions expiring soon (within 3 days for 1-month subscriptions)
    const expiringSoon = await User.findSubscriptionsExpiringSoon(3);
    if (expiringSoon.length > 0) {
      console.log(`\n⚠️  Found ${expiringSoon.length} subscriptions expiring within 3 days:`);
      for (const user of expiringSoon) {
        const daysLeft = Math.ceil((user.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24));
        console.log(`   - ${user.email}: ${user.subscription.plan} expires in ${daysLeft} days`);
      }
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    console.log('🎉 Expired subscription check completed successfully');

  } catch (error) {
    console.error('❌ Error checking expired subscriptions:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the check
checkExpiredSubscriptions();
