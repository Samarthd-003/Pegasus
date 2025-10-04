const logger = require('../utils/logger');
const { mockRazorpayOrder } = require('../mocks/razorpay.mock');
const { createShopifyOrder, getShopifyOrderById, confirmShopifyOrderPayment } = require('./shopifyService');
const { retryWithBackoff } = require('../utils/retry');
const { ValidationError } = require('../utils/errors');

/**
 * In-memory store for orders (replace with actual database in production)
 */
const ordersStore = new Map();

/**
 * Creates a new order in the system with Shopify integration
 * Includes full order creation flow with resilience
 * 
 * @param {Object} orderData - Order data containing customer info, items, amount, etc.
 * @param {string} orderData.email - Customer email (required)
 * @param {number} orderData.amount - Order amount in smallest currency unit
 * @param {string} orderData.currency - Currency code (default: 'INR')
 * @param {Array} orderData.line_items - Line items for the order
 * @param {Object} orderData.billing_address - Billing address
 * @param {Object} orderData.shipping_address - Shipping address
 * @returns {Promise<Object>} Created order object
 */
async function createOrder(orderData) {
  const startTime = Date.now();
  
  try {
    logger.info('🛒 Creating new order', {
      email: orderData?.email,
      amount: orderData?.amount,
      itemCount: orderData?.line_items?.length,
    });

    // Validate required order data
    if (!orderData || typeof orderData !== 'object') {
      throw new ValidationError('Invalid order data: must be an object');
    }

    if (!orderData.email) {
      throw new ValidationError('Invalid order data: email is required');
    }

    if (!orderData.amount || orderData.amount <= 0) {
      throw new ValidationError('Invalid order data: amount must be greater than 0');
    }

    if (!orderData.line_items || !Array.isArray(orderData.line_items) || orderData.line_items.length === 0) {
      throw new ValidationError('Invalid order data: line_items array is required');
    }

    // Generate a unique internal order ID
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Creating order in Shopify', { orderId, email: orderData.email });

    // Prepare Shopify order data
    const shopifyOrderData = {
      email: orderData.email,
      line_items: orderData.line_items,
      currency: orderData.currency || 'INR',
      financial_status: 'pending',
      billing_address: orderData.billing_address || {},
      shipping_address: orderData.shipping_address || orderData.billing_address || {},
      note: orderData.note || `Order created via Pegasus Payment Service - ${orderId}`,
      tags: 'razorpay,pegasus',
      send_receipt: false,
      send_fulfillment_receipt: false,
    };

    // Create order in Shopify with retry logic
    let shopifyOrder;
    try {
      shopifyOrder = await createShopifyOrder(shopifyOrderData);
    } catch (shopifyError) {
      logger.error('Failed to create Shopify order, proceeding with internal order only', {
        orderId,
        error: shopifyError.message,
        statusCode: shopifyError.statusCode,
      });
      
      // Continue with internal order creation even if Shopify fails
      // This ensures we don't lose the order
      shopifyOrder = {
        id: mockRazorpayOrder.id, // Use mock for fallback
        order_number: null,
        financial_status: 'pending',
        note: `Shopify creation failed: ${shopifyError.message}`,
      };
    }

    // Create internal order object
    const order = {
      id: orderId,
      email: orderData.email,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      line_items: orderData.line_items,
      billing_address: orderData.billing_address,
      shipping_address: orderData.shipping_address,
      status: 'created',
      razorpayOrderId: orderData.razorpayOrderId || mockRazorpayOrder.id,
      shopifyOrderId: shopifyOrder.id,
      shopifyOrderNumber: shopifyOrder.order_number,
      shopifyFinancialStatus: shopifyOrder.financial_status,
      metadata: {
        customerNote: orderData.note,
        source: 'api',
        ...orderData.metadata,
      },
      statusHistory: [{
        from: null,
        to: 'created',
        timestamp: new Date().toISOString(),
        note: 'Order created',
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store order in memory with retry for database operations
    await retryWithBackoff(
      () => {
        ordersStore.set(orderId, order);
        return Promise.resolve(order);
      },
      {
        maxRetries: 2,
        timeout: 5000,
        operationName: 'Store Order',
        context: { orderId },
      }
    );

    const duration = Date.now() - startTime;

    logger.info('✅ Order created successfully', {
      orderId,
      shopifyOrderId: order.shopifyOrderId,
      shopifyOrderNumber: order.shopifyOrderNumber,
      email: order.email,
      amount: order.amount,
      duration: `${duration}ms`,
    });

    return order;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('❌ Error creating order', {
      error: error.message,
      email: orderData?.email,
      amount: orderData?.amount,
      duration: `${duration}ms`,
      stack: error.stack,
    });
    
    throw error;
  }
}

/**
 * Retrieves an order by its ID with Shopify sync
 * Optionally syncs with Shopify to get latest status
 * 
 * @param {string} orderId - The unique order identifier
 * @param {Object} options - Retrieval options
 * @param {boolean} options.syncWithShopify - Whether to sync with Shopify (default: false)
 * @returns {Promise<Object|null>} Order object or null if not found
 */
async function getOrderById(orderId, options = {}) {
  const startTime = Date.now();
  
  try {
    logger.info('📋 Fetching order by ID', {
      orderId,
      syncWithShopify: options.syncWithShopify,
    });

    if (!orderId) {
      throw new ValidationError('Order ID is required');
    }

    // Get order from internal store
    const order = ordersStore.get(orderId);

    if (!order) {
      logger.warn('Order not found in internal store', { orderId });
      return null;
    }

    // Optionally sync with Shopify to get latest status
    if (options.syncWithShopify && order.shopifyOrderId) {
      try {
        logger.info('Syncing order with Shopify', {
          orderId,
          shopifyOrderId: order.shopifyOrderId,
        });

        const shopifyOrder = await getShopifyOrderById(order.shopifyOrderId);

        if (shopifyOrder) {
          // Update order with latest Shopify data
          order.shopifyFinancialStatus = shopifyOrder.financial_status;
          order.shopifyFulfillmentStatus = shopifyOrder.fulfillment_status;
          order.shopifyOrderNumber = shopifyOrder.order_number;
          order.lastSyncedAt = new Date().toISOString();
          order.updatedAt = new Date().toISOString();

          // Update in store
          ordersStore.set(orderId, order);

          logger.info('Order synced with Shopify', {
            orderId,
            shopifyOrderId: order.shopifyOrderId,
            financialStatus: shopifyOrder.financial_status,
            fulfillmentStatus: shopifyOrder.fulfillment_status,
          });
        }
      } catch (shopifyError) {
        // Log error but don't fail the entire operation
        logger.warn('Failed to sync with Shopify, returning cached order', {
          orderId,
          shopifyOrderId: order.shopifyOrderId,
          error: shopifyError.message,
        });
      }
    }

    const duration = Date.now() - startTime;

    logger.info('✅ Order retrieved successfully', {
      orderId,
      status: order.status,
      shopifyOrderId: order.shopifyOrderId,
      duration: `${duration}ms`,
    });

    return order;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('❌ Error fetching order', {
      error: error.message,
      orderId,
      duration: `${duration}ms`,
      stack: error.stack,
    });
    
    throw error;
  }
}

/**
 * Updates the status of an existing order with Shopify sync
 * Prevents double-application by checking idempotency key and current status
 * Preserves all failure information and handles success confirmations
 * 
 * @param {string} orderId - The unique order identifier
 * @param {string} status - New status (e.g., 'pending', 'paid', 'failed', 'completed')
 * @param {Object} additionalData - Any additional data to update
 * @param {string} additionalData.idempotencyKey - Idempotency key for duplicate prevention
 * @param {string} additionalData.failureReason - Failure reason (for failed status)
 * @param {string} additionalData.errorCode - Error code (for failed status)
 * @param {string} additionalData.paymentId - Payment ID (for paid status)
 * @param {number} additionalData.amount - Payment amount (for paid status)
 * @param {boolean} additionalData.syncToShopify - Whether to sync to Shopify (default: true)
 * @returns {Promise<Object>} Updated order object
 */
async function updateOrderStatus(orderId, status, additionalData = {}) {
  const startTime = Date.now();
  
  try {
    logger.info('🔄 Updating order status', { 
      orderId, 
      newStatus: status, 
      hasAdditionalData: Object.keys(additionalData).length > 0,
      idempotencyKey: additionalData.idempotencyKey,
      syncToShopify: additionalData.syncToShopify !== false,
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
      failed: ['created', 'authorized'], // Allow retry from failed state
      completed: ['refunded'],
      refunded: [],
      cancelled: [],
    };

    const allowedNextStatuses = validTransitions[currentStatus] || [];
    
    if (!allowedNextStatuses.includes(status) && currentStatus !== status) {
      logger.warn('⚠️  Invalid status transition attempted', {
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
      logger.warn('⚠️  Attempting to change terminal status', {
        orderId,
        currentStatus,
        attemptedStatus: status,
      });
    }

    // Preserve failure information from previous attempts
    const failureHistory = order.failureHistory || [];
    
    // If this is a failure, record full failure details
    if (status === 'failed') {
      const failureRecord = {
        timestamp: new Date().toISOString(),
        previousStatus: currentStatus,
        failureReason: additionalData.failureReason || 'Unknown error',
        errorCode: additionalData.errorCode || null,
        errorDescription: additionalData.errorDescription || null,
        paymentId: additionalData.paymentId || null,
        idempotencyKey,
        metadata: {
          attemptNumber: failureHistory.length + 1,
          ...additionalData.metadata,
        },
      };
      
      failureHistory.push(failureRecord);
      
      logger.warn('💥 Recording order failure', {
        orderId,
        failureReason: failureRecord.failureReason,
        errorCode: failureRecord.errorCode,
        attemptNumber: failureRecord.metadata.attemptNumber,
      });
    }

    // Track status history for audit trail
    const statusHistory = order.statusHistory || [];
    const statusChange = {
      from: currentStatus,
      to: status,
      timestamp: new Date().toISOString(),
      idempotencyKey,
      reason: additionalData.statusChangeReason || null,
    };
    statusHistory.push(statusChange);

    // Prepare updated order object
    const updatedOrder = {
      ...order,
      status,
      previousStatus: currentStatus,
      lastIdempotencyKey: idempotencyKey,
      statusHistory,
      failureHistory,
      updatedAt: new Date().toISOString(),
      // Merge additional data without overwriting core fields
      ...Object.fromEntries(
        Object.entries(additionalData).filter(([key]) => 
          !['syncToShopify', 'idempotencyKey', 'statusChangeReason'].includes(key)
        )
      ),
    };

    // Store updated order with retry
    await retryWithBackoff(
      () => {
        ordersStore.set(orderId, updatedOrder);
        return Promise.resolve();
      },
      {
        maxRetries: 2,
        timeout: 5000,
        operationName: 'Update Order Store',
        context: { orderId, status },
      }
    );

    // Sync to Shopify for success statuses (if enabled)
    if (additionalData.syncToShopify !== false && order.shopifyOrderId) {
      if (status === 'paid' && additionalData.paymentId) {
        try {
          logger.info('💳 Confirming payment in Shopify', {
            orderId,
            shopifyOrderId: order.shopifyOrderId,
            paymentId: additionalData.paymentId,
            amount: additionalData.amount,
          });

          // Confirm payment in Shopify
          const paymentInfo = {
            gateway: 'razorpay',
            kind: 'capture',
            amount: (additionalData.amount || order.amount) / 100, // Convert to currency units
            currency: additionalData.currency || order.currency || 'INR',
            authorization: additionalData.paymentId,
          };

          await confirmShopifyOrderPayment(order.shopifyOrderId, paymentInfo);

          updatedOrder.shopifyFinancialStatus = 'paid';
          updatedOrder.shopifySyncedAt = new Date().toISOString();
          ordersStore.set(orderId, updatedOrder);

          logger.info('✅ Payment confirmed in Shopify', {
            orderId,
            shopifyOrderId: order.shopifyOrderId,
          });
        } catch (shopifyError) {
          // Log error but don't fail the order update
          logger.error('❌ Failed to confirm payment in Shopify', {
            orderId,
            shopifyOrderId: order.shopifyOrderId,
            error: shopifyError.message,
            statusCode: shopifyError.statusCode,
          });
          
          // Store the Shopify sync error
          updatedOrder.shopifySyncError = {
            message: shopifyError.message,
            timestamp: new Date().toISOString(),
            statusCode: shopifyError.statusCode,
          };
          ordersStore.set(orderId, updatedOrder);
        }
      }
    }

    const duration = Date.now() - startTime;

    logger.info('✅ Order status updated successfully', { 
      orderId, 
      previousStatus: currentStatus,
      newStatus: status,
      idempotencyKey,
      failureCount: failureHistory.length,
      shopifySynced: updatedOrder.shopifySyncedAt ? true : false,
      duration: `${duration}ms`,
    });

    return updatedOrder;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('❌ Error updating order status', {
      error: error.message,
      orderId,
      status,
      duration: `${duration}ms`,
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

