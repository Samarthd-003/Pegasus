const logger = require('../utils/logger');
const { mockRazorpayOrder } = require('../mocks/razorpay.mock');
const { mockShopifyOrder } = require('../mocks/shopify.mock');

/**
 * In-memory store for orders (replace with actual database in production)
 */
const ordersStore = new Map();

/**
 * Creates a new order in the system
 * @param {Object} orderData - Order data containing customer info, items, amount, etc.
 * @returns {Promise<Object>} Created order object
 */
async function createOrder(orderData) {
  try {
    logger.info('Creating new order', { orderData });

    // Validate order data
    if (!orderData || !orderData.amount) {
      throw new Error('Invalid order data: amount is required');
    }

    // Generate a unique order ID
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create order object (stubbed with mock data)
    const order = {
      id: orderId,
      ...orderData,
      status: 'created',
      razorpayOrderId: mockRazorpayOrder.id,
      shopifyOrderId: mockShopifyOrder.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store order in memory
    ordersStore.set(orderId, order);

    logger.info('Order created successfully', { orderId, order });

    return order;
  } catch (error) {
    logger.error('Error creating order', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Retrieves an order by its ID
 * @param {string} orderId - The unique order identifier
 * @returns {Promise<Object|null>} Order object or null if not found
 */
async function getOrderById(orderId) {
  try {
    logger.info('Fetching order by ID', { orderId });

    if (!orderId) {
      throw new Error('Order ID is required');
    }

    const order = ordersStore.get(orderId);

    if (!order) {
      logger.warn('Order not found', { orderId });
      return null;
    }

    logger.info('Order retrieved successfully', { orderId });
    return order;
  } catch (error) {
    logger.error('Error fetching order', { error: error.message, orderId });
    throw error;
  }
}

/**
 * Updates the status of an existing order
 * @param {string} orderId - The unique order identifier
 * @param {string} status - New status (e.g., 'pending', 'paid', 'failed', 'completed')
 * @param {Object} additionalData - Any additional data to update
 * @returns {Promise<Object>} Updated order object
 */
async function updateOrderStatus(orderId, status, additionalData = {}) {
  try {
    logger.info('Updating order status', { orderId, status, additionalData });

    const order = ordersStore.get(orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Update order with new status and additional data
    const updatedOrder = {
      ...order,
      status,
      ...additionalData,
      updatedAt: new Date().toISOString(),
    };

    ordersStore.set(orderId, updatedOrder);

    logger.info('Order status updated successfully', { orderId, status });

    return updatedOrder;
  } catch (error) {
    logger.error('Error updating order status', {
      error: error.message,
      orderId,
      status,
    });
    throw error;
  }
}

/**
 * Get all orders (utility function for testing/debugging)
 * @returns {Array} Array of all orders
 */
function getAllOrders() {
  return Array.from(ordersStore.values());
}

/**
 * Clear all orders (utility function for testing)
 */
function clearOrders() {
  ordersStore.clear();
}

module.exports = {
  createOrder,
  getOrderById,
  updateOrderStatus,
  getAllOrders,
  clearOrders,
};

