/**
 * Script to verify all users' emails
 * Usage: node scripts/verifyAllUsers.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
};

const verifyAllUsers = async () => {
  try {
    // Connect to MongoDB
    log.info('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    log.success('Connected to MongoDB');

    // Count users
    const totalUsers = await User.countDocuments();
    log.info(`Total users in database: ${totalUsers}`);

    if (totalUsers === 0) {
      log.warning('No users found in database');
      process.exit(0);
    }

    // Count unverified users
    const unverifiedUsers = await User.countDocuments({ isEmailVerified: false });
    log.info(`Unverified users: ${unverifiedUsers}`);

    if (unverifiedUsers === 0) {
      log.success('All users are already verified!');
      process.exit(0);
    }

    // Update all users to verified
    log.info('Updating all users to verified...');
    const result = await User.updateMany(
      { isEmailVerified: false },
      {
        $set: {
          isEmailVerified: true,
          emailVerificationToken: undefined,
          emailVerificationExpires: undefined,
        }
      }
    );

    log.success(`Successfully updated ${result.modifiedCount} users!`);

    // Show statistics
    log.info('\n📊 Statistics:');
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Users verified: ${result.modifiedCount}`);
    console.log(`   Already verified: ${totalUsers - result.modifiedCount}`);

    // Show sample of updated users
    if (result.modifiedCount > 0) {
      log.info('\nSample of verified users:');
      const sampleUsers = await User.find({ isEmailVerified: true })
        .select('firstName lastName email isEmailVerified createdAt')
        .limit(5)
        .sort({ createdAt: -1 });

      sampleUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.firstName} ${user.lastName} (${user.email})`);
      });
    }

    log.success('\n✨ All users have been verified successfully!');
    log.info('Users can now log in without email verification.');

  } catch (error) {
    log.error(`Error verifying users: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    log.info('Database connection closed.');
    process.exit(0);
  }
};

// Run the script
verifyAllUsers();

