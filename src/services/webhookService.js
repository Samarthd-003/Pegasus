const logger = require('../utils/logger');
const { verifyRazorpaySignature, persistPayment } = require('./paymentService');
const { updateOrderStatus } = require('./orderService');
const { SignatureVerificationError, WebhookProcessingError } = require('../utils/errors');
const {
  extractIdempotencyKey,
  generateIdempotencyKey,
  isKeyProcessed,
  markKeyProcessed,
  getProcessedResult,
} = require('../utils/idempotency');

/**
 * Handles incoming webhook events from Razorpay
 * Verifies signature, checks idempotency, and processes the event
 * 
 * @param {Object} webhookPayload - The parsed webhook payload
 * @param {string} signature - Razorpay signature from headers
 * @param {string} rawBody - Raw webhook body for signature verification
 * @param {Object} headers - Request headers (for idempotency key extraction)
 * @returns {Promise<Object>} Processing result
 * @throws {SignatureVerificationError} When signature verification fails
 * @throws {WebhookProcessingError} When webhook processing fails
 */
async function handleWebhook(webhookPayload, signature, rawBody, headers = {}) {
  const startTime = Date.now();
  let idempotencyKey = null;

  try {
    logger.info('Processing webhook', {
      event: webhookPayload?.event,
      accountId: webhookPayload?.account_id,
      hasSignature: !!signature,
      bodyLength: rawBody?.length,
    });

    // Verify webhook signature (throws on failure)
    try {
      verifyRazorpaySignature(rawBody, signature);
      logger.info('Webhook signature verified successfully');
    } catch (error) {
      // Signature verification already logs the error with context
      throw error; // Re-throw to be caught by outer try-catch
    }

    // Extract or generate idempotency key
    idempotencyKey = extractIdempotencyKey(headers, webhookPayload);
    if (!idempotencyKey) {
      idempotencyKey = generateIdempotencyKey({
        payload: webhookPayload,
        timestamp: Date.now(),
      });
      logger.warn('Generated fallback idempotency key', { idempotencyKey });
    }

    logger.info('Idempotency key extracted', { idempotencyKey });

    // Check if webhook was already processed
    if (isKeyProcessed(idempotencyKey)) {
      const cachedResult = getProcessedResult(idempotencyKey);
      logger.info('Webhook already processed (idempotency check)', {
        idempotencyKey,
        cachedResult,
      });
      return {
        ...cachedResult,
        duplicate: true,
        message: 'Webhook already processed',
      };
    }

    // Extract event details
    const { event, payload } = webhookPayload;

    if (!event) {
      throw new WebhookProcessingError('Webhook event type is missing', {
        payload: webhookPayload,
        idempotencyKey,
      });
    }

    logger.info('Processing webhook event', { event, idempotencyKey });

    // Handle different webhook events
    let result;
    switch (event) {
      case 'payment.authorized':
        result = await handlePaymentAuthorized(payload, idempotencyKey);
        break;

      case 'payment.captured':
        result = await handlePaymentCaptured(payload, idempotencyKey);
        break;

      case 'payment.failed':
        result = await handlePaymentFailed(payload, idempotencyKey);
        break;

      case 'order.paid':
        result = await handleOrderPaid(payload, idempotencyKey);
        break;

      default:
        logger.warn('Unhandled webhook event', { event, idempotencyKey });
        result = { processed: false, message: `Unhandled event: ${event}` };
    }

    // Add idempotency key to result
    result = {
      ...result,
      idempotencyKey,
    };

    // Mark as processed (cache the result)
    if (result.processed) {
      markKeyProcessed(idempotencyKey, result);
    }

    const duration = Date.now() - startTime;
    logger.info('Webhook processed successfully', {
      event,
      idempotencyKey,
      result,
      duration: `${duration}ms`,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error with full context
    logger.error('Error handling webhook', {
      error: error.message,
      errorType: error.name,
      errorContext: error.context || {},
      idempotencyKey,
      duration: `${duration}ms`,
      stack: error.stack,
    });

    // Re-throw signature verification errors as-is
    if (error instanceof SignatureVerificationError) {
      throw error;
    }

    // Wrap other errors in WebhookProcessingError
    if (!(error instanceof WebhookProcessingError)) {
      throw new WebhookProcessingError(error.message, {
        originalError: error.name,
        idempotencyKey,
        duration: `${duration}ms`,
      });
    }

    throw error;
  }
}

/**
 * Handles payment.authorized event
 * @param {Object} payload - Webhook payload
 * @param {string} idempotencyKey - Idempotency key for tracking
 * @returns {Promise<Object>} Processing result
 */
async function handlePaymentAuthorized(payload, idempotencyKey) {
  logger.info('Handling payment.authorized event', { idempotencyKey });

  const payment = payload.payment.entity;

  // Persist payment data
  await persistPayment(payment);

  // Update order status if order_id exists
  if (payment.order_id) {
    await updateOrderStatus(payment.order_id, 'authorized', {
      paymentId: payment.id,
      idempotencyKey,
    });
  }

  return { processed: true, event: 'payment.authorized', paymentId: payment.id };
}

/**
 * Handles payment.captured event
 * @param {Object} payload - Webhook payload
 * @param {string} idempotencyKey - Idempotency key for tracking
 * @returns {Promise<Object>} Processing result
 */
async function handlePaymentCaptured(payload, idempotencyKey) {
  logger.info('Handling payment.captured event', { idempotencyKey });

  const payment = payload.payment.entity;

  // Persist payment data
  await persistPayment(payment);

  // Update order status to paid
  if (payment.order_id) {
    await updateOrderStatus(payment.order_id, 'paid', {
      paymentId: payment.id,
      paidAt: new Date().toISOString(),
      idempotencyKey,
    });
  }

  return { processed: true, event: 'payment.captured', paymentId: payment.id };
}

/**
 * Handles payment.failed event
 * @param {Object} payload - Webhook payload
 * @param {string} idempotencyKey - Idempotency key for tracking
 * @returns {Promise<Object>} Processing result
 */
async function handlePaymentFailed(payload, idempotencyKey) {
  logger.info('Handling payment.failed event', { idempotencyKey });

  const payment = payload.payment.entity;

  // Persist payment data with failed status
  await persistPayment({ ...payment, status: 'failed' });

  // Update order status to failed
  if (payment.order_id) {
    await updateOrderStatus(payment.order_id, 'failed', {
      paymentId: payment.id,
      failureReason: payment.error_description || 'Payment failed',
      idempotencyKey,
    });
  }

  return { processed: true, event: 'payment.failed', paymentId: payment.id };
}

/**
 * Handles order.paid event
 * @param {Object} payload - Webhook payload
 * @param {string} idempotencyKey - Idempotency key for tracking
 * @returns {Promise<Object>} Processing result
 */
async function handleOrderPaid(payload, idempotencyKey) {
  logger.info('Handling order.paid event', { idempotencyKey });

  const order = payload.order.entity;

  // Update order status to completed
  await updateOrderStatus(order.id, 'completed', {
    completedAt: new Date().toISOString(),
    idempotencyKey,
  });

  return { processed: true, event: 'order.paid', orderId: order.id };
}

module.exports = {
  handleWebhook,
  handlePaymentAuthorized,
  handlePaymentCaptured,
  handlePaymentFailed,
  handleOrderPaid,
};

