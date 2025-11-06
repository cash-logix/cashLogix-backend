const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

/**
 * Script to check and expire free trials
 * This should be run periodically (e.g., via cron job)
 */

async function checkExpiredFreeTrials() {
  try {
    console.log('🔍 Checking for expired free trials...');

    // Check if MongoDB is already connected (when used as a module)
    const isStandalone = require.main === module;

    if (isStandalone) {
      // Connect to MongoDB only if running as standalone script
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ Connected to MongoDB');
    } else {
      // When used as a module, check if connection exists
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB is not connected. Please ensure the database connection is established before calling this function.');
      }
    }

    // Find users with active free trials that have expired
    const expiredTrials = await User.find({
      'subscription.freeTrial.isActive': true,
      'subscription.freeTrial.endDate': { $lt: new Date() }
    });

    console.log(`📊 Found ${expiredTrials.length} expired free trials`);

    if (expiredTrials.length === 0) {
      console.log('✅ No expired free trials to process');
      if (isStandalone) {
        await mongoose.connection.close();
      }
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Process each expired trial
    for (const user of expiredTrials) {
      try {
        console.log(`\n⏰ Processing expired trial for: ${user.email}`);
        console.log(`   Trial started: ${user.subscription.freeTrial.startDate}`);
        console.log(`   Trial ended: ${user.subscription.freeTrial.endDate}`);
        console.log(`   Current plan: ${user.subscription.plan}`);

        // Update free trial status
        user.subscription.freeTrial.isActive = false;
        user.subscription.freeTrial.used = true;

        // If user is still on free plan (didn't upgrade during trial), keep them on free
        // If they upgraded to a paid plan during trial, keep their paid plan
        if (user.subscription.plan === 'free') {
          console.log(`   ✓ User remained on free plan - no changes needed`);
        } else {
          console.log(`   ✓ User has paid plan: ${user.subscription.plan} - keeping it`);
        }

        await user.save();
        successCount++;
        console.log(`   ✅ Successfully expired trial for ${user.email}`);
      } catch (error) {
        errorCount++;
        console.error(`   ❌ Error processing trial for ${user.email}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY:');
    console.log(`   Total expired trials found: ${expiredTrials.length}`);
    console.log(`   Successfully processed: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('='.repeat(60));

    if (isStandalone) {
      await mongoose.connection.close();
    }
    console.log('✅ Script completed successfully');
  } catch (error) {
    console.error('❌ Script error:', error);
    if (require.main === module) {
      process.exit(1);
    } else {
      throw error; // Re-throw when used as a module
    }
  }
}

// Run the script
if (require.main === module) {
  checkExpiredFreeTrials()
    .then(() => {
      console.log('🎉 All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = checkExpiredFreeTrials;

