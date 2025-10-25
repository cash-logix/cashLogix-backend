#!/usr/bin/env node

/**
 * Quick script to enable project creation for a user
 * Usage: node scripts/enableProjects.js <email>
 */

const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const enableProjects = async (email) => {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.NODE_ENV === 'test'
      ? process.env.MONGODB_TEST_URI
      : process.env.MONGODB_URI;

    if (!mongoURI) {
      console.error('❌ MONGODB_URI not found in environment variables');
      console.log('Please set MONGODB_URI in your .env file');
      process.exit(1);
    }

    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }

    console.log(`👤 Found user: ${user.firstName} ${user.lastName}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`📋 Current plan: ${user.subscription.plan}`);

    // Update to Personal Plus plan (minimum for project creation)
    user.subscription.plan = 'personal_plus';
    user.subscription.status = 'active';
    user.subscription.startDate = new Date();

    // Set end date to 1 month from now
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    user.subscription.endDate = endDate;

    await user.save();

    console.log(`✅ Successfully enabled project creation!`);
    console.log(`📋 New plan: ${user.subscription.plan}`);
    console.log(`📊 Status: ${user.subscription.status}`);
    console.log(`📅 Valid until: ${user.subscription.endDate}`);
    console.log(`\n🎉 User can now create up to 3 projects!`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error enabling projects:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Get email from command line
const email = process.argv[2];
if (!email) {
  console.log('Usage: node scripts/enableProjects.js <email>');
  console.log('Example: node scripts/enableProjects.js user@example.com');
  process.exit(1);
}

enableProjects(email);
