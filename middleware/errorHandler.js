const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('❌ Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = {
      message,
      statusCode: 404,
      arabic: 'المورد غير موجود'
    };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists`;
    error = {
      message,
      statusCode: 400,
      arabic: `'${value}' موجود بالفعل`
    };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      message,
      statusCode: 400,
      arabic: 'بيانات غير صحيحة'
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = {
      message,
      statusCode: 401,
      arabic: 'رمز غير صحيح'
    };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = {
      message,
      statusCode: 401,
      arabic: 'انتهت صلاحية الرمز'
    };
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large';
    error = {
      message,
      statusCode: 400,
      arabic: 'الملف كبير جداً'
    };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    error = {
      message,
      statusCode: 400,
      arabic: 'حقل ملف غير متوقع'
    };
  }

  // Rate limiting errors
  if (err.statusCode === 429) {
    const message = 'Too many requests, please try again later';
    error = {
      message,
      statusCode: 429,
      arabic: 'طلبات كثيرة، يرجى المحاولة لاحقاً'
    };
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Server Error';
  const arabic = error.arabic || 'خطأ في الخادم';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      arabic,
      statusCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  });
};

module.exports = errorHandler;
