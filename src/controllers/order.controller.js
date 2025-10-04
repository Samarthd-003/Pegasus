const orderService = require('../services/order.service');
const logger = require('../utils/logger');

const createOrder = async (req, res) => {
  try {
    const order = await orderService.createOrder(req.body);
    res.status(201).json(order);
  } catch (error) {
    logger.error('Error creating order:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const getOrderById = async (req, res) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.status(200).json(order);
  } catch (error) {
    logger.error(`Error fetching order ${req.params.id}:`, error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const handleWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const { event, payload } = req.body;

  try {
    const { order_id, id: payment_id } = payload.payment.entity;
    
    if (!orderService.verifyRazorpaySignature(order_id, payment_id, signature)) {
      logger.warn('Webhook signature verification failed');
      return res.status(400).json({ message: 'Invalid signature' });
    }

    logger.info(`Webhook received for event: ${event}`);

    if (event === 'payment.captured') {
      await orderService.persistPayment(order_id, payload.payment.entity);
      await orderService.updateOrderStatus(order_id, 'paid');
      logger.info(`Order ${order_id} marked as paid`);
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error('Error handling webhook:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  createOrder,
  getOrderById,
  handleWebhook,
};
