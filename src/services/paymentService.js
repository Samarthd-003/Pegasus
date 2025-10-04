const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');
const { mockRazorpayPayment } = require('../mocks/razorpay.mock');

/**
 * In-memory store for payments (replace with actual database in production)
 */
const paymentsStore = new Map();

/**
 * Verifies the Razorpay webhook signature to ensure authenticity
 * @param {string} webhookBody - Raw webhook body as string
 * @param {string} signature - Razorpay signature from headers
 * @param {string} secret - Webhook secret (defaults to config)
 * @returns {boolean} True if signature is valid, false otherwise
 */
function verifyRazorpaySignature(webhookBody, signature, secret = null) {
  try {
    logger.info('Verifying Razorpay signature');

    const webhookSecret = secret || config.razorpay.webhookSecret;

    if (!webhookSecret) {
      logger.warn('Webhook secret not configured, skipping verification');
      // In mock mode, return true if no secret is configured
      return true;
    }

    if (!signature) {
      logger.error('No signature provided');
      return false;
    }

    // Generate expected signature using HMAC SHA256
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookBody)
      .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    logger.info('Signature verification result', { isValid });

    return isValid;
  } catch (error) {
    logger.error('Error verifying Razorpay signature', {
      error: error.message,
      stack: error.stack,
    });
    return false;
  }
}

/**
 * Persists payment information to the database
 * @param {Object} paymentData - Payment data from Razorpay
 * @returns {Promise<Object>} Persisted payment object
 */
async function persistPayment(paymentData) {
  try {
    logger.info('Persisting payment data', { paymentData });

    if (!paymentData || !paymentData.id) {
      throw new Error('Invalid payment data: payment ID is required');
    }

    // Create payment record (stubbed with mock data)
    const payment = {
      id: paymentData.id || `pay_${Date.now()}`,
      razorpayPaymentId: paymentData.razorpay_payment_id || mockRazorpayPayment.id,
      razorpayOrderId: paymentData.razorpay_order_id || mockRazorpayPayment.order_id,
      razorpaySignature: paymentData.razorpay_signature || 'mock_signature',
      amount: paymentData.amount || mockRazorpayPayment.amount,
      currency: paymentData.currency || mockRazorpayPayment.currency,
      status: paymentData.status || 'captured',
      method: paymentData.method || mockRazorpayPayment.method,
      email: paymentData.email || mockRazorpayPayment.email,
      contact: paymentData.contact || mockRazorpayPayment.contact,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store payment in memory
    paymentsStore.set(payment.id, payment);

    logger.info('Payment persisted successfully', { paymentId: payment.id });

    return payment;
  } catch (error) {
    logger.error('Error persisting payment', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Retrieves a payment by its ID
 * @param {string} paymentId - The payment identifier
 * @returns {Promise<Object|null>} Payment object or null if not found
 */
async function getPaymentById(paymentId) {
  try {
    logger.info('Fetching payment by ID', { paymentId });

    const payment = paymentsStore.get(paymentId);

    if (!payment) {
      logger.warn('Payment not found', { paymentId });
      return null;
    }

    return payment;
  } catch (error) {
    logger.error('Error fetching payment', { error: error.message, paymentId });
    throw error;
  }
}

/**
 * Get all payments (utility function for testing/debugging)
 * @returns {Array} Array of all payments
 */
function getAllPayments() {
  return Array.from(paymentsStore.values());
}

/**
 * Clear all payments (utility function for testing)
 */
function clearPayments() {
  paymentsStore.clear();
}

module.exports = {
  verifyRazorpaySignature,
  persistPayment,
  getPaymentById,
  getAllPayments,
  clearPayments,
};

