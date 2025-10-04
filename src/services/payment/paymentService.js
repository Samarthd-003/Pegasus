const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../utils/logger');
const { SignatureVerificationError } = require('../../utils/errors');

const verifyRazorpaySignature = (payload, signature) => {
  const hmac = crypto.createHmac('sha256', config.razorpayWebhookSecret);
  hmac.update(JSON.stringify(payload));
  const digest = hmac.digest('hex');

  if (digest !== signature) {
    logger.error('Razorpay signature verification failed', { payload, signature, digest });
    throw new SignatureVerificationError('Invalid Razorpay signature');
  }

  return true;
};

const persistPayment = async (paymentDetails) => {
  // TODO: Implement database persistence
  return { ...paymentDetails, status: 'captured' };
};

module.exports = {
  verifyRazorpaySignature,
  persistPayment,
};
