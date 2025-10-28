# Test Receipt Generator Script

This script generates test receipts for your establishments using their API tokens.

## Prerequisites

- Node.js installed
- Backend server running on `http://localhost:5000`
- Valid API tokens for establishments

## Usage

### Basic Usage (50 receipts per establishment)

```bash
cd backend
node scripts/generateTestReceipts.js
```

### Custom Number of Receipts

```bash
# Generate 100 receipts per establishment
node scripts/generateTestReceipts.js 100

# Generate 10 receipts per establishment (for quick testing)
node scripts/generateTestReceipts.js 10

# Generate 200 receipts per establishment
node scripts/generateTestReceipts.js 200
```

## What It Does

The script will:

1. ✅ Generate receipts for both establishments:

   - **Test1234** (Restaurant)
   - **Test Cafe** (Cafe)

2. ✅ Each receipt includes:

   - Auto-generated unique 8-character receipt ID (e.g., `aB3x9Kmq`)
   - Random amount between $10 and $500
   - Random items (Pizza, Burger, Coffee, etc.)
   - Random table number (1-20)
   - Current date
   - Random payment method (cash, card, mobile)

3. ✅ Creates receipts using the establishment API endpoints
   - Uses proper API token authentication
   - Follows the same flow as real establishments

## Output Example

```
🚀 Starting receipt generation...

📋 Will create 50 receipts per establishment (2 establishments)

📍 Generating receipts for Test1234 (restaurant)...

✅ Created receipt aB3x9Kmq for Test1234 - Amount: $125.50
✅ Created receipt pN7jR2wK for Test1234 - Amount: $89.20
...

📍 Generating receipts for Test Cafe (cafe)...

✅ Created receipt mT4vX8Cd for Test Cafe - Amount: $45.75
✅ Created receipt yH6zF3Qn for Test Cafe - Amount: $156.30
...


📊 ========== SUMMARY ==========

Total Receipts Attempted: 100
✅ Successful: 100
❌ Failed: 0
Success Rate: 100.00%

📍 By Establishment:

  Test1234:
    ✅ Successful: 50
    ❌ Failed: 0
    💰 Total Amount: $8,234.50
    📝 Sample Receipt IDs:
       - aB3x9Kmq
       - pN7jR2wK
       - xF5mC8Tz

  Test Cafe:
    ✅ Successful: 50
    ❌ Failed: 0
    💰 Total Amount: $7,890.25
    📝 Sample Receipt IDs:
       - mT4vX8Cd
       - yH6zF3Qn
       - rK9pW2Dj

================================

✨ Receipt generation completed!
```

## Configuration

To add more establishments or change settings, edit the script:

```javascript
// Add more establishments here
const establishments = [
  {
    id: "ESTABLISHMENT_ID",
    name: "Establishment Name",
    type: "restaurant", // or 'cafe', 'supermarket', etc.
    apiToken: "YOUR_API_TOKEN_HERE",
  },
];
```

## Customization Options

You can modify the script to customize:

- **Amount Range**: Change `randomAmount(10, 500)` to any range
- **Items**: Add more items to the `items` array
- **Delay**: Adjust `setTimeout(resolve, 100)` for faster/slower generation
- **Metadata**: Add more fields to the `metadata` object

## Testing Receipts

After generating receipts, you can:

1. **View in Establishment Dashboard**: Login as establishment to see all receipts
2. **Claim as User**: Login as a user and use the receipt IDs to claim points
3. **Test the system**: Verify that:
   - Points are calculated correctly
   - Receipts can only be claimed once
   - Dashboard statistics are updated

## Notes

- Receipts are created as **unclaimed** by default
- Each receipt ID is unique (uses timestamp + random number)
- The script includes a 100ms delay between requests to avoid overwhelming the server
- All receipts use the establishment's API token for authentication

## Troubleshooting

### Error: "Invalid or expired API token"

- Check that the API tokens in the script match your database
- Ensure the establishments are verified (`isVerified: true`)

### Error: "Receipt ID already exists"

- Very rare, but if it happens, just run the script again
- The timestamp + random combination ensures uniqueness

### Server not responding

- Make sure your backend server is running on `http://localhost:5000`
- Check that the database is connected

## Clean Up

To remove test receipts from the database (if needed):

```javascript
// In MongoDB shell or Compass
db.receipts.deleteMany({ receiptId: { $regex: /^(RESTAURANT|CAFE)-/ } });
```

Or delete receipts for a specific establishment:

```javascript
db.receipts.deleteMany({ establishment: ObjectId("69000a8a983c3186829b9bd4") });
```
