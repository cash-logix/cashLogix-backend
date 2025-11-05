require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const i18next = require('./config/i18n');
const i18nextMiddleware = require('i18next-http-middleware');

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(i18nextMiddleware.handle(i18next));

// Serve static files (uploaded logos)
app.use('/uploads', express.static('uploads'));

// Make i18n available in req
app.use((req, res, next) => {
  req.language = req.language || 'en';
  next();
});

// Routes
app.use('/api/auth/user', require('./routes/userAuthRoutes'));
app.use('/api/auth/establishment', require('./routes/establishmentAuthRoutes'));
app.use('/api/establishment/profile', require('./routes/establishmentProfileRoutes'));
app.use('/api/receipts', require('./routes/receiptRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handler
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

