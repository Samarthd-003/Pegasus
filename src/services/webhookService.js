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
 * Flow: received → validated → applied
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
    // PHASE 1: RECEIVED - Log incoming webhook
    logger.info('📥 RECEIVED: Webhook received', {
      event: webhookPayload?.event,
      accountId: webhookPayload?.account_id,
      hasSignature: !!signature,
      bodyLength: rawBody?.length,
      timestamp: new Date().toISOString(),
    });

    // PHASE 2: VALIDATED - Verify signature
    try {
      verifyRazorpaySignature(rawBody, signature);
      logger.info('✅ VALIDATED: Webhook signature verified successfully', {
        event: webhookPayload?.event,
      });
    } catch (error) {
      logger.error('❌ VALIDATION FAILED: Signature verification failed', {
        event: webhookPayload?.event,
        error: error.message,
      });
      throw error;
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

    // Check if webhook was already processed (prevent double-application)
    if (isKeyProcessed(idempotencyKey)) {
      const cachedResult = getProcessedResult(idempotencyKey);
      logger.info('⚠️  SKIPPED: Webhook already processed (duplicate detected)', {
        idempotencyKey,
        event: webhookPayload?.event,
        cachedResult,
      });
      return {
        ...cachedResult,
        duplicate: true,
        message: 'Webhook already processed',
      };
    }

    // Parse and validate event
    const { event, payload } = webhookPayload;

    if (!event) {
      logger.error('❌ PARSE ERROR: Webhook event type is missing', {
        payload: webhookPayload,
        idempotencyKey,
      });
      throw new WebhookProcessingError('Webhook event type is missing', {
        payload: webhookPayload,
        idempotencyKey,
      });
    }

    if (!payload) {
      logger.error('❌ PARSE ERROR: Webhook payload is missing', {
        event,
        idempotencyKey,
      });
      throw new WebhookProcessingError('Webhook payload is missing', {
        event,
        idempotencyKey,
      });
    }

    logger.info('🔄 PROCESSING: Handling webhook event', { 
      event, 
      idempotencyKey,
      hasPayload: !!payload,
    });

    // PHASE 3: APPLIED - Process event based on type
    let result;
    try {
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
          logger.warn('⚠️  UNHANDLED: Unknown webhook event type', { 
            event, 
            idempotencyKey,
          });
          result = { 
            processed: false, 
            message: `Unhandled event: ${event}`,
            event,
          };
      }

      // Add idempotency key to result
      result = {
        ...result,
        idempotencyKey,
      };

      // Mark as processed (cache the result to prevent double-application)
      if (result.processed) {
        markKeyProcessed(idempotencyKey, result);
        logger.info('✅ APPLIED: Webhook processed and cached', {
          event,
          idempotencyKey,
          result: {
            processed: result.processed,
            event: result.event,
            paymentId: result.paymentId,
            orderId: result.orderId,
          },
        });
      }

      const duration = Date.now() - startTime;
      logger.info('✅ SUCCESS: Webhook processing completed', {
        event,
        idempotencyKey,
        duration: `${duration}ms`,
        processed: result.processed,
      });

      return result;
    } catch (processingError) {
      // Log processing error but don't crash
      logger.error('❌ PROCESSING ERROR: Failed to process webhook event', {
        event,
        idempotencyKey,
        error: processingError.message,
        stack: processingError.stack,
      });
      throw processingError;
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error with full context
    logger.error('❌ FAILED: Webhook processing failed', {
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
 * Logs errors but doesn't fail the entire webhook processing
 * 
 * @param {Object} payload - Webhook payload
 * @param {string} idempotencyKey - Idempotency key for tracking
 * @returns {Promise<Object>} Processing result
 */
async function handlePaymentAuthorized(payload, idempotencyKey) {
  logger.info('💳 Processing payment.authorized event', { idempotencyKey });

  try {
    // Validate payload structure
    if (!payload?.payment?.entity) {
      logger.error('Invalid payload structure for payment.authorized', {
        idempotencyKey,
        hasPayload: !!payload,
        hasPayment: !!payload?.payment,
      });
      throw new WebhookProcessingError('Invalid payment.authorized payload structure');
    }

    const payment = payload.payment.entity;

    if (!payment.id) {
      logger.error('Payment ID missing in payment.authorized', { idempotencyKey });
      throw new WebhookProcessingError('Payment ID is required');
    }

    logger.info('Persisting authorized payment', {
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      idempotencyKey,
    });

    // Persist payment data
    await persistPayment(payment);

    // Update order status if order_id exists
    if (payment.order_id) {
      logger.info('Updating order status to authorized', {
        orderId: payment.order_id,
        paymentId: payment.id,
        idempotencyKey,
      });

      await updateOrderStatus(payment.order_id, 'authorized', {
        paymentId: payment.id,
        idempotencyKey,
        authorizedAt: new Date().toISOString(),
      });
    } else {
      logger.warn('No order_id in payment, skipping order update', {
        paymentId: payment.id,
        idempotencyKey,
      });
    }

    logger.info('✅ Payment authorized event processed successfully', {
      paymentId: payment.id,
      orderId: payment.order_id,
      idempotencyKey,
    });

    return { 
      processed: true, 
      event: 'payment.authorized', 
      paymentId: payment.id,
      orderId: payment.order_id,
    };
  } catch (error) {
    logger.error('Failed to process payment.authorized', {
      error: error.message,
      idempotencyKey,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Handles payment.captured event
 * Persists payment and updates order status on successful capture
 * Logs errors but doesn't fail the entire webhook processing
 * 
 * @param {Object} payload - Webhook payload
 * @param {string} idempotencyKey - Idempotency key for tracking
 * @returns {Promise<Object>} Processing result
 */
async function handlePaymentCaptured(payload, idempotencyKey) {
  logger.info('💰 Processing payment.captured event', { idempotencyKey });

  try {
    // Validate payload structure
    if (!payload?.payment?.entity) {
      logger.error('Invalid payload structure for payment.captured', {
        idempotencyKey,
        hasPayload: !!payload,
        hasPayment: !!payload?.payment,
      });
      throw new WebhookProcessingError('Invalid payment.captured payload structure');
    }

    const payment = payload.payment.entity;

    if (!payment.id) {
      logger.error('Payment ID missing in payment.captured', { idempotencyKey });
      throw new WebhookProcessingError('Payment ID is required');
    }

    logger.info('Persisting captured payment', {
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      idempotencyKey,
    });

    // Persist payment data (this is the critical operation for captures)
    await persistPayment(payment);

    // Update order status to paid
    if (payment.order_id) {
      logger.info('Updating order status to paid', {
        orderId: payment.order_id,
        paymentId: payment.id,
        amount: payment.amount,
        idempotencyKey,
      });

      await updateOrderStatus(payment.order_id, 'paid', {
        paymentId: payment.id,
        paidAt: new Date().toISOString(),
        amount: payment.amount,
        currency: payment.currency,
        idempotencyKey,
      });
    } else {
      logger.warn('No order_id in payment, skipping order update', {
        paymentId: payment.id,
        idempotencyKey,
      });
    }

    logger.info('✅ Payment captured event processed successfully', {
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      idempotencyKey,
    });

    return { 
      processed: true, 
      event: 'payment.captured', 
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
    };
  } catch (error) {
    logger.error('Failed to process payment.captured', {
      error: error.message,
      idempotencyKey,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Handles payment.failed event
 * Persists failure information and updates order status
 * Does NOT throw on failures to prevent blocking other webhooks
 * 
 * @param {Object} payload - Webhook payload
 * @param {string} idempotencyKey - Idempotency key for tracking
 * @returns {Promise<Object>} Processing result
 */
async function handlePaymentFailed(payload, idempotencyKey) {
  logger.info('❌ Processing payment.failed event', { idempotencyKey });

  try {
    // Validate payload structure
    if (!payload?.payment?.entity) {
      logger.error('Invalid payload structure for payment.failed', {
        idempotencyKey,
        hasPayload: !!payload,
        hasPayment: !!payload?.payment,
      });
      throw new WebhookProcessingError('Invalid payment.failed payload structure');
    }

    const payment = payload.payment.entity;

    if (!payment.id) {
      logger.error('Payment ID missing in payment.failed', { idempotencyKey });
      throw new WebhookProcessingError('Payment ID is required');
    }

    const failureReason = payment.error_description || payment.error_reason || 'Payment failed';

    logger.info('Persisting failed payment', {
      paymentId: payment.id,
      orderId: payment.order_id,
      failureReason,
      errorCode: payment.error_code,
      idempotencyKey,
    });

    // Persist payment data with failed status
    await persistPayment({ 
      ...payment, 
      status: 'failed',
      failureReason,
    });

    // Update order status to failed
    if (payment.order_id) {
      logger.info('Updating order status to failed', {
        orderId: payment.order_id,
        paymentId: payment.id,
        failureReason,
        idempotencyKey,
      });

      await updateOrderStatus(payment.order_id, 'failed', {
        paymentId: payment.id,
        failureReason,
        errorCode: payment.error_code,
        failedAt: new Date().toISOString(),
        idempotencyKey,
      });
    } else {
      logger.warn('No order_id in failed payment, skipping order update', {
        paymentId: payment.id,
        idempotencyKey,
      });
    }

    logger.info('✅ Payment failed event processed successfully', {
      paymentId: payment.id,
      orderId: payment.order_id,
      failureReason,
      idempotencyKey,
    });

    return { 
      processed: true, 
      event: 'payment.failed', 
      paymentId: payment.id,
      orderId: payment.order_id,
      failureReason,
    };
  } catch (error) {
    // Log error but mark as processed to prevent retries
    logger.error('Failed to process payment.failed webhook (logging only)', {
      error: error.message,
      idempotencyKey,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Handles order.paid event
 * Updates order to completed status
 * 
 * @param {Object} payload - Webhook payload
 * @param {string} idempotencyKey - Idempotency key for tracking
 * @returns {Promise<Object>} Processing result
 */
async function handleOrderPaid(payload, idempotencyKey) {
  logger.info('📦 Processing order.paid event', { idempotencyKey });

  try {
    // Validate payload structure
    if (!payload?.order?.entity) {
      logger.error('Invalid payload structure for order.paid', {
        idempotencyKey,
        hasPayload: !!payload,
        hasOrder: !!payload?.order,
      });
      throw new WebhookProcessingError('Invalid order.paid payload structure');
    }

    const order = payload.order.entity;

    if (!order.id) {
      logger.error('Order ID missing in order.paid', { idempotencyKey });
      throw new WebhookProcessingError('Order ID is required');
    }

    logger.info('Updating order to completed status', {
      orderId: order.id,
      amount: order.amount,
      idempotencyKey,
    });

    // Update order status to completed
    await updateOrderStatus(order.id, 'completed', {
      completedAt: new Date().toISOString(),
      amount: order.amount,
      amountPaid: order.amount_paid,
      idempotencyKey,
    });

    logger.info('✅ Order paid event processed successfully', {
      orderId: order.id,
      idempotencyKey,
    });

    return { 
      processed: true, 
      event: 'order.paid', 
      orderId: order.id,
    };
  } catch (error) {
    logger.error('Failed to process order.paid', {
      error: error.message,
      idempotencyKey,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  handleWebhook,
  handlePaymentAuthorized,
  handlePaymentCaptured,
  handlePaymentFailed,
  handleOrderPaid,
};

