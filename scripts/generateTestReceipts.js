const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:5000/api';

// Establishments with their API tokens
const establishments = [
  {
    id: '69000a8a983c3186829b9bd4',
    name: 'Test1234',
    type: 'restaurant',
    apiToken: '48954f4ae05c9786850954873e90d2629124a1b72355e57c7f718c27d53204b5'
  },
  {
    id: '6900dcfe03b89d53480abdd8',
    name: 'Test Cafe',
    type: 'cafe',
    apiToken: '8bf4b0d209cc24bc6fded4b98012f10acaa5ffc63057b2d19de24f1d99dd5ef5'
  }
];

// Helper function to generate random amount between min and max
function randomAmount(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// Helper function to generate random items for metadata
function generateRandomItems(count) {
  const items = [
    'Pizza', 'Burger', 'Pasta', 'Salad', 'Sandwich', 'Soup', 'Steak',
    'Coffee', 'Tea', 'Juice', 'Soda', 'Water', 'Dessert', 'Ice Cream',
    'French Fries', 'Chicken Wings', 'Nachos', 'Tacos', 'Sushi', 'Ramen'
  ];

  const selectedItems = [];
  for (let i = 0; i < count; i++) {
    selectedItems.push(items[Math.floor(Math.random() * items.length)]);
  }
  return selectedItems;
}

// Create receipt for an establishment
async function createReceipt(establishment, receiptNumber) {
  const amount = randomAmount(10, 500);
  const itemCount = Math.floor(Math.random() * 5) + 1;
  const items = generateRandomItems(itemCount);

  const receiptData = {
    amount: amount,
    metadata: {
      items: items,
      table: `${Math.floor(Math.random() * 20) + 1}`,
      orderDate: new Date().toISOString().split('T')[0],
      paymentMethod: ['cash', 'card', 'mobile'][Math.floor(Math.random() * 3)]
    }
  };

  try {
    const response = await axios.post(
      `${API_URL}/receipts`,
      receiptData,
      {
        headers: {
          'x-api-token': establishment.apiToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const receiptId = response.data.receipt.receiptId;
    console.log(`✅ Created receipt ${receiptId} for ${establishment.name} - Amount: $${amount}`);
    return { success: true, receiptId, amount };
  } catch (error) {
    console.error(`❌ Failed to create receipt for ${establishment.name}:`, error.response?.data?.message || error.message);
    return { success: false, error: error.message };
  }
}

// Main function to generate receipts
async function generateReceipts(receiptsPerEstablishment = 50) {
  console.log('\n🚀 Starting receipt generation...\n');
  console.log(`📋 Will create ${receiptsPerEstablishment} receipts per establishment (${establishments.length} establishments)\n`);

  const results = {
    total: 0,
    successful: 0,
    failed: 0,
    byEstablishment: {}
  };

  for (const establishment of establishments) {
    console.log(`\n📍 Generating receipts for ${establishment.name} (${establishment.type})...\n`);

    results.byEstablishment[establishment.name] = {
      successful: 0,
      failed: 0,
      totalAmount: 0,
      receipts: []
    };

    for (let i = 1; i <= receiptsPerEstablishment; i++) {
      const result = await createReceipt(establishment, i);

      results.total++;

      if (result.success) {
        results.successful++;
        results.byEstablishment[establishment.name].successful++;
        results.byEstablishment[establishment.name].totalAmount += result.amount;
        results.byEstablishment[establishment.name].receipts.push(result.receiptId);
      } else {
        results.failed++;
        results.byEstablishment[establishment.name].failed++;
      }

      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Print summary
  console.log('\n\n📊 ========== SUMMARY ==========\n');
  console.log(`Total Receipts Attempted: ${results.total}`);
  console.log(`✅ Successful: ${results.successful}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.successful / results.total) * 100).toFixed(2)}%\n`);

  console.log('📍 By Establishment:\n');
  for (const [name, stats] of Object.entries(results.byEstablishment)) {
    console.log(`  ${name}:`);
    console.log(`    ✅ Successful: ${stats.successful}`);
    console.log(`    ❌ Failed: ${stats.failed}`);
    console.log(`    💰 Total Amount: $${stats.totalAmount.toFixed(2)}`);
    console.log(`    📝 Sample Receipt IDs:`);
    stats.receipts.slice(0, 3).forEach(id => console.log(`       - ${id}`));
    console.log('');
  }

  console.log('================================\n');
}

// Parse command line arguments
const args = process.argv.slice(2);
const receiptsPerEstablishment = parseInt(args[0]) || 50;

// Run the script
generateReceipts(receiptsPerEstablishment)
  .then(() => {
    console.log('✨ Receipt generation completed!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });

