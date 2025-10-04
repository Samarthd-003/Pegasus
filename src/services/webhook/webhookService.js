const paymentService = require('../payment/paymentService');
const orderService = require('../order/orderService');
const logger = require('../../utils/logger');

const handleWebhook = async ({ body, headers = {} }) => {
  logger.info('Webhook received', { event: body.event });
  const signature = headers['x-razorpay-signature'];
  paymentService.verifyRazorpaySignature(body, signature);
  logger.info('Webhook signature validated');

  const idempotencyKey = headers['idempotency-key'];

  if (body.event === 'payment.captured') {
    try {
      const paymentDetails = body.payload.payment.entity;
      await paymentService.persistPayment(paymentDetails);

      const orderId = paymentDetails.order_id;
      await orderService.updateOrderStatus(orderId, 'paid');
      logger.info('Webhook applied: payment captured and order status updated', { orderId });
    } catch (error) {
      logger.error('Error processing payment.captured webhook', {
        error: error.message,
        orderId: body.payload.payment.entity.order_id,
      });
    }
  } else {
    logger.info('Ignoring webhook event', { event: body.event });
  }

  return { received: true, idempotencyKey };
};

module.exports = {
  handleWebhook,
};
