const logger = require('../utils/logger');
const { PegasusError } = require('../utils/errors');

/**
 * Global error handling middleware
 * Handles both custom and generic errors with proper logging
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  // Handle custom PegasusError instances
  if (err instanceof PegasusError) {
    logger.error('Pegasus error', {
      errorType: err.name,
      error: err.message,
      statusCode: err.statusCode,
      context: err.context,
      url: req.url,
      method: req.method,
    });

    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      errorType: err.name,
      ...(process.env.NODE_ENV === 'development' && { 
        context: err.context,
        stack: err.stack,
      }),
    });
  }

  // Handle generic errors
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;

