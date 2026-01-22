// config/corsOptions.js
const isProduction = process.env.NODE_ENV === 'production';

// Base allowed origins
const productionOrigins = [
  'https://www.cash-logix.com',
  'https://cash-logix.com',
  'https://cash-logix.vercel.app'
];

const developmentOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000'
];

// Build allowed origins
let allowedOrigins = [...productionOrigins];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

if (!isProduction) {
  allowedOrigins.push(...developmentOrigins);
}

// Filter undefined
const origins = allowedOrigins.filter(origin => origin);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (isProduction && origin.includes('localhost')) {
      return callback(new Error('Localhost origins are not allowed in production'));
    }

    const normalizedOrigin = origin.replace(/\/$/, '');
    const isAllowed = origins.some(allowedOrigin => {
      return normalizedOrigin === allowedOrigin.replace(/\/$/, '');
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS Blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language']
};

module.exports = corsOptions;