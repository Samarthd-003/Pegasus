const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  logger.info(`Verifying Razorpay signature for orderId: ${orderId}`);
  const body = `${orderId}|${paymentId}`;

  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(body.toString())
    .digest('hex');

  if (expectedSignature === signature) {
    logger.info(`Signature verification successful for orderId: ${orderId}`);
    return true;
  }

  logger.warn(`Signature verification failed for orderId: ${orderId}`);
  return false;
};

module.exports = {
  verifyRazorpaySignature,
};
