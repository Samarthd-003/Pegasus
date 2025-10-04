const logger = require('../utils/logger');
const { verifyRazorpaySignature, persistPayment } = require('./paymentService');
const { updateOrderStatus } = require('./orderService');

/**
 * Handles incoming webhook events from Razorpay
 * @param {Object} webhookPayload - The parsed webhook payload
 * @param {string} signature - Razorpay signature from headers
 * @param {string} rawBody - Raw webhook body for signature verification
 * @returns {Promise<Object>} Processing result
 */
async function handleWebhook(webhookPayload, signature, rawBody) {
  try {
    logger.info('Processing webhook', {
      event: webhookPayload.event,
      accountId: webhookPayload.account_id,
    });

    // Verify webhook signature
    const isValid = verifyRazorpaySignature(rawBody, signature);

    if (!isValid) {
      logger.error('Invalid webhook signature');
      throw new Error('Invalid webhook signature');
    }

    // Extract event details
    const { event, payload } = webhookPayload;

    logger.info('Webhook signature verified', { event });

    // Handle different webhook events
    let result;
    switch (event) {
      case 'payment.authorized':
        result = await handlePaymentAuthorized(payload);
        break;

      case 'payment.captured':
        result = await handlePaymentCaptured(payload);
        break;

      case 'payment.failed':
        result = await handlePaymentFailed(payload);
        break;

      case 'order.paid':
        result = await handleOrderPaid(payload);
        break;

      default:
        logger.warn('Unhandled webhook event', { event });
        result = { processed: false, message: `Unhandled event: ${event}` };
    }

    logger.info('Webhook processed successfully', { event, result });

    return result;
  } catch (error) {
    logger.error('Error handling webhook', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Handles payment.authorized event
 * @param {Object} payload - Webhook payload
 * @returns {Promise<Object>} Processing result
 */
async function handlePaymentAuthorized(payload) {
  logger.info('Handling payment.authorized event');

  const payment = payload.payment.entity;

  // Persist payment data
  await persistPayment(payment);

  // Update order status if order_id exists
  if (payment.order_id) {
    await updateOrderStatus(payment.order_id, 'authorized', {
      paymentId: payment.id,
    });
  }

  return { processed: true, event: 'payment.authorized', paymentId: payment.id };
}

/**
 * Handles payment.captured event
 * @param {Object} payload - Webhook payload
 * @returns {Promise<Object>} Processing result
 */
async function handlePaymentCaptured(payload) {
  logger.info('Handling payment.captured event');

  const payment = payload.payment.entity;

  // Persist payment data
  await persistPayment(payment);

  // Update order status to paid
  if (payment.order_id) {
    await updateOrderStatus(payment.order_id, 'paid', {
      paymentId: payment.id,
      paidAt: new Date().toISOString(),
    });
  }

  return { processed: true, event: 'payment.captured', paymentId: payment.id };
}

/**
 * Handles payment.failed event
 * @param {Object} payload - Webhook payload
 * @returns {Promise<Object>} Processing result
 */
async function handlePaymentFailed(payload) {
  logger.info('Handling payment.failed event');

  const payment = payload.payment.entity;

  // Persist payment data with failed status
  await persistPayment({ ...payment, status: 'failed' });

  // Update order status to failed
  if (payment.order_id) {
    await updateOrderStatus(payment.order_id, 'failed', {
      paymentId: payment.id,
      failureReason: payment.error_description || 'Payment failed',
    });
  }

  return { processed: true, event: 'payment.failed', paymentId: payment.id };
}

/**
 * Handles order.paid event
 * @param {Object} payload - Webhook payload
 * @returns {Promise<Object>} Processing result
 */
async function handleOrderPaid(payload) {
  logger.info('Handling order.paid event');

  const order = payload.order.entity;

  // Update order status to completed
  await updateOrderStatus(order.id, 'completed', {
    completedAt: new Date().toISOString(),
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

