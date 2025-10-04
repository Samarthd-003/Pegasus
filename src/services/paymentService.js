const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');
const { mockRazorpayPayment } = require('../mocks/razorpay.mock');
const { SignatureVerificationError, ValidationError } = require('../utils/errors');

/**
 * In-memory store for payments (replace with actual database in production)
 */
const paymentsStore = new Map();

/**
 * Verifies the Razorpay webhook signature to ensure authenticity
 * Uses HMAC-SHA256 to verify the webhook payload against the signature
 * 
 * @param {string} webhookBody - Raw webhook body as string (must be raw, not parsed)
 * @param {string} signature - Razorpay signature from x-razorpay-signature header
 * @param {string} secret - Webhook secret (defaults to config)
 * @throws {SignatureVerificationError} When signature verification fails
 * @throws {ValidationError} When required parameters are missing
 * @returns {boolean} True if signature is valid
 */
function verifyRazorpaySignature(webhookBody, signature, secret = null) {
  const startTime = Date.now();
  const context = {
    hasBody: !!webhookBody,
    bodyLength: webhookBody ? webhookBody.length : 0,
    hasSignature: !!signature,
    signatureLength: signature ? signature.length : 0,
    hasSecret: !!(secret || config.razorpay.webhookSecret),
  };

  logger.info('Starting Razorpay signature verification', context);

  try {
    // Validate required parameters
    if (!webhookBody || typeof webhookBody !== 'string') {
      logger.error('Invalid webhook body provided', {
        ...context,
        bodyType: typeof webhookBody,
      });
      throw new ValidationError('Webhook body must be a non-empty string', {
        ...context,
        reason: 'invalid_body',
      });
    }

    if (!signature || typeof signature !== 'string') {
      logger.error('Invalid or missing signature', {
        ...context,
        signatureType: typeof signature,
      });
      throw new SignatureVerificationError('Webhook signature is required', {
        ...context,
        reason: 'missing_signature',
      });
    }

    const webhookSecret = secret || config.razorpay.webhookSecret;

    // Check if webhook secret is configured
    if (!webhookSecret) {
      logger.warn('Webhook secret not configured, operating in mock mode', context);
      // In development/mock mode, allow webhooks without secret
      if (config.server.nodeEnv === 'development') {
        logger.info('Development mode: Skipping signature verification', context);
        return true;
      }
      // In production, this is a configuration error
      throw new ValidationError('Webhook secret not configured', {
        ...context,
        reason: 'missing_secret',
        environment: config.server.nodeEnv,
      });
    }

    // Generate expected signature using HMAC SHA256
    // Razorpay uses the raw body directly for signature generation
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookBody)
      .digest('hex');

    logger.debug('Signature generated', {
      ...context,
      expectedSignatureLength: expectedSignature.length,
    });

    // Validate signature format (should be hex string)
    const hexRegex = /^[a-f0-9]+$/i;
    if (!hexRegex.test(signature)) {
      logger.error('Invalid signature format', {
        ...context,
        signatureFormat: 'not_hex',
      });
      throw new SignatureVerificationError('Signature must be a valid hex string', {
        ...context,
        reason: 'invalid_format',
      });
    }

    if (!hexRegex.test(expectedSignature)) {
      logger.error('Generated signature has invalid format', {
        ...context,
        reason: 'generation_error',
      });
      throw new SignatureVerificationError('Failed to generate valid signature', {
        ...context,
        reason: 'generation_error',
      });
    }

    // Check if signatures have the same length before comparison
    if (signature.length !== expectedSignature.length) {
      const duration = Date.now() - startTime;
      logger.error('Signature length mismatch', {
        ...context,
        providedLength: signature.length,
        expectedLength: expectedSignature.length,
        duration: `${duration}ms`,
      });
      throw new SignatureVerificationError('Signature verification failed', {
        ...context,
        reason: 'length_mismatch',
        providedLength: signature.length,
        expectedLength: expectedSignature.length,
      });
    }

    // Use timingSafeEqual to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    );

    const duration = Date.now() - startTime;

    if (!isValid) {
      logger.error('Signature verification failed: Signature mismatch', {
        ...context,
        duration: `${duration}ms`,
        reason: 'signature_mismatch',
      });
      throw new SignatureVerificationError('Signature verification failed', {
        ...context,
        reason: 'signature_mismatch',
        duration: `${duration}ms`,
      });
    }

    logger.info('Signature verification successful', {
      ...context,
      duration: `${duration}ms`,
    });

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Re-throw our custom errors
    if (error instanceof SignatureVerificationError || error instanceof ValidationError) {
      logger.error('Signature verification error', {
        ...context,
        error: error.message,
        errorType: error.name,
        errorContext: error.context,
        duration: `${duration}ms`,
      });
      throw error;
    }

    // Handle unexpected errors
    logger.error('Unexpected error during signature verification', {
      ...context,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    
    throw new SignatureVerificationError('Signature verification failed due to unexpected error', {
      ...context,
      reason: 'unexpected_error',
      originalError: error.message,
      duration: `${duration}ms`,
    });
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

