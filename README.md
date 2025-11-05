# Rage3 Loyalty System - Backend API

## Overview

Backend API for the Rage3 loyalty system that allows establishments to create receipts and users to collect points.

## Setup

### Prerequisites

- Node.js (v14 or higher)
- MongoDB

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the backend directory with the following variables:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/Rage3
JWT_SECRET=your_jwt_secret_key_change_this_in_production
JWT_EXPIRE=7d
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=noreply@Rage3.com
CLIENT_URL=http://localhost:3000
```

3. Start the server:

```bash
npm run dev
```

## API Documentation

### Multi-Language Support

All endpoints support Arabic and English. Include `Accept-Language` header in your requests:

- `Accept-Language: en` for English
- `Accept-Language: ar` for Arabic

---

## Authentication Endpoints

### User Authentication

#### Register User

```
POST /api/auth/user/register
```

**Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "mobile": "1234567890",
  "password": "password123"
}
```

#### Login User

```
POST /api/auth/user/login
```

**Body:**

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

#### Verify Email

```
GET /api/auth/user/verify-email/:token
```

#### Resend Activation Link

```
POST /api/auth/user/resend-activation
```

**Body:**

```json
{
  "email": "john@example.com"
}
```

#### Forgot Password

```
POST /api/auth/user/forgot-password
```

**Body:**

```json
{
  "email": "john@example.com"
}
```

#### Reset Password

```
POST /api/auth/user/reset-password/:token
```

**Body:**

```json
{
  "password": "newpassword123"
}
```

### Establishment Authentication

#### Register Establishment

```
POST /api/auth/establishment/register
```

**Body:**

```json
{
  "type": "restaurant",
  "commercialName": "My Restaurant",
  "email": "restaurant@example.com",
  "phone": "1234567890",
  "password": "password123"
}
```

Types: `restaurant`, `cafe`, `supermarket`, `bakery`, `other`

#### Login Establishment

```
POST /api/auth/establishment/login
```

**Body:**

```json
{
  "email": "restaurant@example.com",
  "password": "password123"
}
```

**Response includes `apiToken` which is used for receipt creation.**

#### Verify Email

```
GET /api/auth/establishment/verify-email/:token
```

#### Resend Activation Link

```
POST /api/auth/establishment/resend-activation
```

#### Forgot Password

```
POST /api/auth/establishment/forgot-password
```

#### Reset Password

```
POST /api/auth/establishment/reset-password/:token
```

---

## Receipt Endpoints

### Create Receipt (For Establishments)

```
POST /api/receipts
```

**Headers:**

```
x-api-token: YOUR_ESTABLISHMENT_API_TOKEN
```

**Body:**

```json
{
  "receiptId": "REC-12345",
  "amount": 100.5,
  "metadata": {
    "items": ["item1", "item2"],
    "date": "2023-10-27"
  }
}
```

### Claim Receipt (For Users)

```
POST /api/receipts/claim
```

**Headers:**

```
Authorization: Bearer USER_JWT_TOKEN
```

**Body:**

```json
{
  "receiptId": "REC-12345",
  "establishmentId": "establishment_id_here"
}
```

### Get Establishment Receipts

```
GET /api/receipts/establishment?page=1&limit=20&claimed=true
```

**Headers:**

```
Authorization: Bearer ESTABLISHMENT_JWT_TOKEN
```

### Deduct Points

```
POST /api/receipts/deduct-points
```

**Headers:**

```
Authorization: Bearer ESTABLISHMENT_JWT_TOKEN
```

**Body:**

```json
{
  "userId": "user_id_here",
  "points": 50
}
```

---

## Dashboard Endpoints

### Get User Dashboard

```
GET /api/dashboard/user
```

**Headers:**

```
Authorization: Bearer USER_JWT_TOKEN
```

**Response:**

```json
{
  "user": {
    "id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "1234567890"
  },
  "points": [
    {
      "establishment": {
        "_id": "...",
        "commercialName": "My Restaurant",
        "type": "restaurant",
        "logo": "..."
      },
      "amount": 150
    }
  ],
  "recentReceipts": [...]
}
```

### Get Establishment Dashboard

```
GET /api/dashboard/establishment
```

**Headers:**

```
Authorization: Bearer ESTABLISHMENT_JWT_TOKEN
```

**Response:**

```json
{
  "establishment": {...},
  "stats": {
    "totalReceipts": 100,
    "claimedReceipts": 80,
    "unclaimedReceipts": 20,
    "totalPointsDistributed": 5000,
    "totalUsers": 50
  },
  "users": [
    {
      "userId": "...",
      "name": "John Doe",
      "email": "john@example.com",
      "mobile": "1234567890",
      "points": 150
    }
  ],
  "recentReceipts": [...]
}
```

### Get All Establishments (Public)

```
GET /api/dashboard/establishments
```

### Search User (For Establishments)

```
GET /api/dashboard/search-user?query=john
```

**Headers:**

```
Authorization: Bearer ESTABLISHMENT_JWT_TOKEN
```

---

## Integration Guide for Establishments

### Step 1: Get Your API Token

After registering and verifying your email, login to get your `apiToken` from the login response.

### Step 2: Create Receipts

When you create an order in your system, send it to our API:

```javascript
const axios = require("axios");

async function createReceipt(receiptId, amount) {
  try {
    const response = await axios.post(
      "http://your-api-url/api/receipts",
      {
        receiptId: receiptId,
        amount: amount,
        metadata: {
          // Optional additional data
        },
      },
      {
        headers: {
          "x-api-token": "YOUR_API_TOKEN_HERE",
          "Accept-Language": "en", // or 'ar'
        },
      }
    );
    console.log("Receipt created:", response.data);
  } catch (error) {
    console.error("Error:", error.response.data);
  }
}
```

### Step 3: Security

- Keep your API token secure
- Never expose it in client-side code
- Use it only from your backend server

### Example: PHP Integration

```php
<?php
$apiToken = 'YOUR_API_TOKEN_HERE';
$apiUrl = 'http://your-api-url/api/receipts';

$data = [
    'receiptId' => 'REC-' . uniqid(),
    'amount' => 100.50,
    'metadata' => [
        'order_id' => '12345'
    ]
];

$ch = curl_init($apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'x-api-token: ' . $apiToken,
    'Accept-Language: en'
]);

$response = curl_exec($ch);
curl_close($ch);

echo $response;
?>
```

---

## Error Handling

All errors return a JSON response with a `message` field:

```json
{
  "message": "Error description here"
}
```

Common HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Server Error

---

## Support

For any integration issues or questions, please contact our support team.
