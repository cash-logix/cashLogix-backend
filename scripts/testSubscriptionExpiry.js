#!/usr/bin/env node

/**
 * Test script to verify subscription expiration functionality
 * Usage: node scripts/testSubscriptionExpiry.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const testSubscriptionExpiry = async () => {
  try {
    console.log('🧪 Testing subscription expiration functionality...');

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

    // Find user by email
    const user = await User.findOne({ email: 'gergessamuel100@gmail.com' });
    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    console.log(`👤 Testing with user: ${user.firstName} ${user.lastName}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`📋 Current plan: ${user.subscription.plan}`);
    console.log(`📊 Current status: ${user.subscription.status}`);
    console.log(`📅 Start date: ${user.subscription.startDate}`);
    console.log(`📅 End date: ${user.subscription.endDate}`);

    // Test virtual fields
    console.log('\n🔍 Testing virtual fields:');
    console.log(`   Is subscription expired: ${user.isSubscriptionExpired}`);
    console.log(`   Days until expiry: ${user.daysUntilExpiry}`);
    console.log(`   Is subscription active: ${user.isSubscriptionActive()}`);
    console.log(`   Can create projects: ${user.canCreateProjects()}`);
    console.log(`   Can add partners: ${user.canAddPartners()}`);
    console.log(`   Can use advanced features: ${user.canUseAdvancedFeatures()}`);

    // Test subscription info method
    console.log('\n📊 Subscription info:');
    const subscriptionInfo = user.getSubscriptionInfo();
    console.log(JSON.stringify(subscriptionInfo, null, 2));

    // Test static methods
    console.log('\n🔍 Testing static methods:');
    const expiredUsers = await User.findExpiredSubscriptions();
    console.log(`   Users with expired subscriptions: ${expiredUsers.length}`);

    const expiringSoon = await User.findSubscriptionsExpiringSoon(7);
    console.log(`   Users with subscriptions expiring within 7 days: ${expiringSoon.length}`);

    await mongoose.disconnect();
    console.log('\n✅ Test completed successfully');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the test
testSubscriptionExpiry();
