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
 * Prevents double-application by checking idempotency key and current status
 * 
 * @param {string} orderId - The unique order identifier
 * @param {string} status - New status (e.g., 'pending', 'paid', 'failed', 'completed')
 * @param {Object} additionalData - Any additional data to update
 * @returns {Promise<Object>} Updated order object
 */
async function updateOrderStatus(orderId, status, additionalData = {}) {
  try {
    logger.info('Updating order status', { 
      orderId, 
      newStatus: status, 
      hasAdditionalData: Object.keys(additionalData).length > 0,
      idempotencyKey: additionalData.idempotencyKey,
    });

    const order = ordersStore.get(orderId);

    if (!order) {
      logger.error('Order not found for status update', { orderId, status });
      throw new Error(`Order not found: ${orderId}`);
    }

    const currentStatus = order.status;
    const idempotencyKey = additionalData.idempotencyKey;

    // Check if this update has already been applied (prevent double-application)
    if (idempotencyKey && order.lastIdempotencyKey === idempotencyKey) {
      logger.info('⚠️  Status update already applied (idempotency check)', {
        orderId,
        status,
        currentStatus: order.status,
        idempotencyKey,
      });
      return order; // Return existing order without modification
    }

    // Validate status transition
    const validTransitions = {
      created: ['authorized', 'paid', 'failed', 'cancelled'],
      authorized: ['paid', 'failed', 'cancelled'],
      paid: ['completed', 'refunded'],
      failed: ['created'], // Allow retry
      completed: ['refunded'],
      refunded: [],
      cancelled: [],
    };

    const allowedNextStatuses = validTransitions[currentStatus] || [];
    
    if (!allowedNextStatuses.includes(status) && currentStatus !== status) {
      logger.warn('Invalid status transition attempted', {
        orderId,
        currentStatus,
        attemptedStatus: status,
        allowedStatuses: allowedNextStatuses,
      });
      // Log but don't throw - allow the transition in case of edge cases
    }

    // Prevent downgrade from completed/refunded unless explicitly allowed
    const terminalStatuses = ['completed', 'refunded'];
    if (terminalStatuses.includes(currentStatus) && status !== currentStatus) {
      logger.warn('Attempting to change terminal status', {
        orderId,
        currentStatus,
        attemptedStatus: status,
      });
    }

    // Track status history for audit trail
    const statusHistory = order.statusHistory || [];
    statusHistory.push({
      from: currentStatus,
      to: status,
      timestamp: new Date().toISOString(),
      idempotencyKey,
    });

    // Update order with new status and additional data
    const updatedOrder = {
      ...order,
      status,
      ...additionalData,
      statusHistory,
      lastIdempotencyKey: idempotencyKey,
      previousStatus: currentStatus,
      updatedAt: new Date().toISOString(),
    };

    ordersStore.set(orderId, updatedOrder);

    logger.info('✅ Order status updated successfully', { 
      orderId, 
      previousStatus: currentStatus,
      newStatus: status,
      idempotencyKey,
    });

    return updatedOrder;
  } catch (error) {
    logger.error('❌ Error updating order status', {
      error: error.message,
      orderId,
      status,
      stack: error.stack,
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

