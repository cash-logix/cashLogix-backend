/**
 * Response Helper Utility
 * Centralizes all API responses with proper i18n support
 */

class ResponseHelper {
  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {String} messageKey - Translation key (e.g., 'auth.login_successful')
   * @param {Object} data - Additional data to send
   * @param {Number} statusCode - HTTP status code (default: 200)
   */
  static success(res, messageKey, data = {}, statusCode = 200) {
    const message = res.req.t(messageKey);
    return res.status(statusCode).json({
      success: true,
      message,
      ...data
    });
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {String} messageKey - Translation key (e.g., 'auth.invalid_credentials')
   * @param {Number} statusCode - HTTP status code (default: 400)
   * @param {Object} errors - Additional error details
   */
  static error(res, messageKey, statusCode = 400, errors = null) {
    const message = res.req.t(messageKey);
    const response = {
      success: false,
      message
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send validation error response
   * @param {Object} res - Express response object
   * @param {Array} errors - Array of validation errors
   */
  static validationError(res, errors) {
    return res.status(400).json({
      success: false,
      message: res.req.t('validation.invalid_request'),
      errors
    });
  }

  /**
   * Send server error response
   * @param {Object} res - Express response object
   * @param {Error} error - Error object
   */
  static serverError(res, error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      message: res.req.t('server.error'),
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
}

module.exports = ResponseHelper;

