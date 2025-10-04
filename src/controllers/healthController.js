const logger = require('../utils/logger');

/**
 * Health check endpoint controller
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function healthCheck(req, res) {
  logger.info('Health check requested');

  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'pegasus-payment-service',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };

  res.status(200).json(healthStatus);
}

module.exports = {
  healthCheck,
};

