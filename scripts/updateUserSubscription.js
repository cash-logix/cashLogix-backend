#!/usr/bin/env node

/**
 * Script to update user subscription plan
 * Usage: node scripts/updateUserSubscription.js <email> <plan>
 * Plans: free, personal_plus, contractor_pro, company_plan
 */

const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const updateUserSubscription = async (email, plan) => {
  try {
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

    // Validate plan
    const validPlans = ['free', 'personal_plus', 'contractor_pro', 'company_plan'];
    if (!validPlans.includes(plan)) {
      console.error(`❌ Invalid plan. Valid plans are: ${validPlans.join(', ')}`);
      process.exit(1);
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }

    console.log(`👤 Found user: ${user.firstName} ${user.lastName}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`📋 Current plan: ${user.subscription.plan}`);
    console.log(`📊 Current status: ${user.subscription.status}`);

    // Update subscription
    user.subscription.plan = plan;
    user.subscription.status = 'active';
    user.subscription.startDate = new Date();

    // Set end date based on plan (optional)
    if (plan !== 'free') {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // 1 month from now
      user.subscription.endDate = endDate;
    }

    await user.save();

    console.log(`✅ Successfully updated user subscription!`);
    console.log(`📋 New plan: ${user.subscription.plan}`);
    console.log(`📊 New status: ${user.subscription.status}`);
    console.log(`📅 Start date: ${user.subscription.startDate}`);

    if (user.subscription.endDate) {
      console.log(`📅 End date: ${user.subscription.endDate}`);
    }

    // Show plan limits
    const planLimits = {
      free: { maxProjects: 0, maxExpenses: 50, maxRevenues: 50, maxPartners: 0 },
      personal_plus: { maxProjects: 3, maxExpenses: 200, maxRevenues: 200, maxPartners: 2 },
      contractor_pro: { maxProjects: 10, maxExpenses: 1000, maxRevenues: 1000, maxPartners: 5 },
      company_plan: { maxProjects: 'unlimited', maxExpenses: 'unlimited', maxRevenues: 'unlimited', maxPartners: 'unlimited' }
    };

    console.log(`\n📊 Plan Limits:`);
    console.log(`   Projects: ${planLimits[plan].maxProjects}`);
    console.log(`   Expenses: ${planLimits[plan].maxExpenses}`);
    console.log(`   Revenues: ${planLimits[plan].maxRevenues}`);
    console.log(`   Partners: ${planLimits[plan].maxPartners}`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error updating user subscription:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Get command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.log('Usage: node scripts/updateUserSubscription.js <email> <plan>');
  console.log('Plans: free, personal_plus, contractor_pro, company_plan');
  console.log('Example: node scripts/updateUserSubscription.js user@example.com personal_plus');
  process.exit(1);
}

const [email, plan] = args;
updateUserSubscription(email, plan);
