# 🚀 Quick Start - Generate Test Receipts

## Simple Commands

Make sure your backend server is running first!

### Generate 50 receipts (default):

```bash
npm run generate-receipts
```

### Generate 10 receipts (quick test):

```bash
npm run generate-receipts:10
```

### Generate 100 receipts:

```bash
npm run generate-receipts:100
```

### Generate 200 receipts:

```bash
npm run generate-receipts:200
```

### Custom number:

```bash
node scripts/generateTestReceipts.js 75
```

---

## What happens?

The script will create receipts for:

- ✅ **Test1234** (Restaurant)
- ✅ **Test Cafe** (Cafe)

Each receipt gets:

- 💳 Auto-generated 8-character unique ID (e.g., `aB3x9Kmq`)
- 💰 Random amount ($10 - $500)
- 🍕 Random items
- 📅 Current date

---

## After generating receipts:

### 1. Test as User:

- Login as a user
- Go to "Upload Receipt"
- Use any generated receipt ID (shown in console output)
- Claim your points!

### 2. Test as Establishment:

- Login as Test1234 or Test Cafe
- View all receipts in dashboard
- See which ones are claimed vs unclaimed
- Test the deduct points feature

---

## Example Output:

```
🚀 Starting receipt generation...

✅ Created receipt aB3x9Kmq for Test1234 - Amount: $125.50
✅ Created receipt pN7jR2wK for Test1234 - Amount: $89.20
✅ Created receipt mT4vX8Cd for Test Cafe - Amount: $45.75

📊 ========== SUMMARY ==========
Total: 100
✅ Successful: 100
❌ Failed: 0
```

---

## 💡 Pro Tip:

Copy a few receipt IDs from the console output and save them to test claiming points as a user!

Example receipt IDs you'll get:

- `aB3x9Kmq`
- `mT4vX8Cd`
- `pN7jR2wK`
- `yH6zF3Qn`
