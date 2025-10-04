const shopifyService = require('../shopify/shopifyService');
const logger = require('../../utils/logger');

// Mock database
const ordersDB = new Map();

const createOrder = async (orderDetails) => {
  logger.info('Creating order', { orderDetails });
  const shopifyOrder = await shopifyService.createShopifyOrder(orderDetails);
  ordersDB.set(shopifyOrder.id, shopifyOrder);
  logger.info('Order created and stored', { orderId: shopifyOrder.id });
  return shopifyOrder;
};

const getOrderById = async (orderId) => {
  logger.info('Getting order by ID', { orderId });
  if (ordersDB.has(orderId)) {
    return ordersDB.get(orderId);
  }
  // Fallback to Shopify if not in local cache
  logger.info('Order not in cache, fetching from Shopify', { orderId });
  const shopifyOrder = await shopifyService.getShopifyOrder(orderId);
  if (shopifyOrder) {
    ordersDB.set(orderId, shopifyOrder);
  }
  return shopifyOrder;
};

const updateOrderStatus = async (orderId, status, failureReason = null) => {
  logger.info('Updating order status', { orderId, status, failureReason });
  const order = await getOrderById(orderId);
  if (!order) {
    logger.error('Order not found for status update', { orderId });
    return null;
  }

  const updatedOrder = {
    ...order,
    status,
    ...(failureReason && { failureReason }),
  };
  ordersDB.set(orderId, updatedOrder);
  logger.info('Order status updated', { orderId, newStatus: status });
  return updatedOrder;
};

module.exports = {
  createOrder,
  getOrderById,
  updateOrderStatus,
  ordersDB,
};
