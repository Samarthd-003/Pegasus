const logger = require('../utils/logger');
const razorpayService = require('./razorpay.service');

// Mock data simulating a database
const orders = new Map();

const createOrder = async (orderDetails) => {
  logger.info('Creating a new order');
  // Mocking Shopify API call
  logger.info('Fetching product details from Shopify for product ID:', orderDetails.productId);
  const mockShopifyProduct = {
    id: orderDetails.productId,
    name: 'Mock Product',
    price: 100,
  };

  const orderId = `order_${Date.now()}`;
  const order = {
    orderId,
    ...orderDetails,
    product: mockShopifyProduct,
    status: 'created',
    createdAt: new Date(),
  };
  orders.set(orderId, order);
  logger.info(`Order ${orderId} created successfully`);
  return order;
};

const updateOrderStatus = async (orderId, status) => {
  logger.info(`Updating status for order ${orderId} to ${status}`);
  if (!orders.has(orderId)) {
    logger.warn(`Order ${orderId} not found for status update`);
    return null;
  }
  const order = orders.get(orderId);
  order.status = status;
  order.updatedAt = new Date();
  orders.set(orderId, order);
  logger.info(`Order ${orderId} status updated to ${status}`);
  return order;
};

const persistPayment = async (orderId, paymentDetails) => {
  logger.info(`Persisting payment for order ${orderId}`);
  if (!orders.has(orderId)) {
    logger.warn(`Order ${orderId} not found for payment persistence`);
    return null;
  }
  const order = orders.get(orderId);
  order.paymentDetails = paymentDetails;
  orders.set(orderId, order);
  logger.info(`Payment for order ${orderId} persisted`);
  return order;
};

const getOrderById = async (orderId) => {
  logger.info(`Fetching order by ID: ${orderId}`);
  if (!orders.has(orderId)) {
    logger.warn(`Order ${orderId} not found`);
    return null;
  }
  return orders.get(orderId);
};

module.exports = {
  createOrder,
  updateOrderStatus,
  persistPayment,
  getOrderById,
  verifyRazorpaySignature: razorpayService.verifyRazorpaySignature,
};
