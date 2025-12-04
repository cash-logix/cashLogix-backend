/**
 * Production-Ready Logger for Cash Logix Backend
 * Reduces logging overhead in production while maintaining essential logs
 */

const isProduction = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'debug');

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.info;

/**
 * Format log message with timestamp
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} meta - Additional metadata
 * @returns {string} Formatted log message
 */
const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
};

const logger = {
  /**
   * Log error messages (always logged)
   * @param {string} message - Error message
   * @param {object} meta - Additional metadata
   */
  error(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, meta));
    }
  },

  /**
   * Log warning messages
   * @param {string} message - Warning message
   * @param {object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  /**
   * Log info messages (not logged in production by default)
   * @param {string} message - Info message
   * @param {object} meta - Additional metadata
   */
  info(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.info) {
      console.info(formatMessage('info', message, meta));
    }
  },

  /**
   * Log debug messages (only in development)
   * @param {string} message - Debug message
   * @param {object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.debug(formatMessage('debug', message, meta));
    }
  },

  /**
   * Log request information (minimal in production)
   * @param {object} req - Express request object
   */
  request(req) {
    if (!isProduction) {
      this.debug(`${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 50)
      });
    }
  },

  /**
   * Log database query (only in development)
   * @param {string} operation - Query operation
   * @param {string} collection - Collection name
   * @param {number} duration - Query duration in ms
   */
  query(operation, collection, duration) {
    if (!isProduction && duration > 100) {
      this.warn(`Slow query: ${operation} on ${collection}`, { duration: `${duration}ms` });
    }
  },

  /**
   * Log cache hit/miss (only in development)
   * @param {string} key - Cache key
   * @param {boolean} hit - Whether cache hit occurred
   */
  cache(key, hit) {
    if (!isProduction) {
      this.debug(`Cache ${hit ? 'HIT' : 'MISS'}: ${key}`);
    }
  }
};

module.exports = logger;

