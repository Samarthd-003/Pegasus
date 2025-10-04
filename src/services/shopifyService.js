const logger = require('../utils/logger');
const config = require('../config');
const { retryWithBackoff } = require('../utils/retry');
const { mockShopifyOrder } = require('../mocks/shopify.mock');

/**
 * Shopify API base configuration
 */
const SHOPIFY_API_VERSION = '2024-01';
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Build Shopify API URL
 * @param {string} endpoint - API endpoint path
 * @returns {string} Full API URL
 */
function buildShopifyUrl(endpoint) {
  const storeUrl = config.shopify.storeUrl;
  if (!storeUrl) {
    throw new Error('Shopify store URL not configured');
  }
  
  // Remove trailing slash from store URL
  const baseUrl = storeUrl.replace(/\/$/, '');
  // Remove leading slash from endpoint
  const path = endpoint.replace(/^\//, '');
  
  return `${baseUrl}/admin/api/${SHOPIFY_API_VERSION}/${path}`;
}

/**
 * Makes an HTTP request to Shopify API
 * Uses native https module to avoid external dependencies
 * 
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body data
 * @returns {Promise<Object>} Response data
 */
async function makeShopifyRequest(method, endpoint, data = null) {
  const url = buildShopifyUrl(endpoint);
  const accessToken = config.shopify.accessToken;

  if (!accessToken) {
    throw new Error('Shopify access token not configured');
  }

  logger.debug('Making Shopify API request', {
    method,
    endpoint,
    url: url.replace(accessToken, '***'),
  });

  // For now, use mock mode in development if credentials aren't configured
  const isMockMode = config.server.nodeEnv === 'development' && (!config.shopify.storeUrl || !config.shopify.accessToken);

  if (isMockMode) {
    logger.warn('⚠️  Shopify mock mode: credentials not configured', {
      method,
      endpoint,
      nodeEnv: config.server.nodeEnv,
    });
    
    // Return mock data based on endpoint
    if (endpoint.includes('orders')) {
      return { order: mockShopifyOrder };
    }
    return { data: 'mock_response' };
  }

  return new Promise((resolve, reject) => {
    const https = require('https');
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      timeout: REQUEST_TIMEOUT,
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = responseData ? JSON.parse(responseData) : {};
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            logger.debug('Shopify API request successful', {
              method,
              endpoint,
              statusCode: res.statusCode,
            });
            resolve(parsedData);
          } else {
            const error = new Error(`Shopify API error: ${res.statusCode}`);
            error.statusCode = res.statusCode;
            error.response = { status: res.statusCode, data: parsedData };
            logger.error('Shopify API request failed', {
              method,
              endpoint,
              statusCode: res.statusCode,
              error: parsedData,
            });
            reject(error);
          }
        } catch (parseError) {
          logger.error('Failed to parse Shopify API response', {
            method,
            endpoint,
            error: parseError.message,
            rawResponse: responseData,
          });
          reject(parseError);
        }
      });
    });

    req.on('error', (error) => {
      logger.error('Shopify API request error', {
        method,
        endpoint,
        error: error.message,
        code: error.code,
      });
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      const error = new Error(`Shopify API request timeout after ${REQUEST_TIMEOUT}ms`);
      error.name = 'TimeoutError';
      logger.error('Shopify API request timeout', {
        method,
        endpoint,
        timeout: REQUEST_TIMEOUT,
      });
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Creates an order in Shopify
 * Includes retry logic for resilience
 * 
 * @param {Object} orderData - Order data
 * @param {string} orderData.email - Customer email
 * @param {Array} orderData.line_items - Line items
 * @param {Object} orderData.billing_address - Billing address
 * @param {Object} orderData.shipping_address - Shipping address
 * @param {string} orderData.financial_status - Financial status (e.g., 'pending', 'paid')
 * @param {Object} orderData.transactions - Payment transactions
 * @returns {Promise<Object>} Created Shopify order
 */
async function createShopifyOrder(orderData) {
  const startTime = Date.now();
  
  logger.info('Creating Shopify order', {
    email: orderData.email,
    itemCount: orderData.line_items?.length,
    financialStatus: orderData.financial_status,
  });

  try {
    // Validate required fields
    if (!orderData.email) {
      throw new Error('Customer email is required for Shopify order');
    }

    if (!orderData.line_items || orderData.line_items.length === 0) {
      throw new Error('Line items are required for Shopify order');
    }

    // Create order with retry logic
    const response = await retryWithBackoff(
      () => makeShopifyRequest('POST', 'orders.json', { order: orderData }),
      {
        maxRetries: 3,
        timeout: 30000,
        operationName: 'Create Shopify Order',
        context: {
          email: orderData.email,
          itemCount: orderData.line_items?.length,
        },
      }
    );

    const duration = Date.now() - startTime;
    const order = response.order;

    logger.info('✅ Shopify order created successfully', {
      shopifyOrderId: order.id,
      orderNumber: order.order_number,
      email: order.email,
      totalPrice: order.total_price,
      financialStatus: order.financial_status,
      duration: `${duration}ms`,
    });

    return order;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('❌ Failed to create Shopify order', {
      error: error.message,
      email: orderData.email,
      statusCode: error.statusCode,
      duration: `${duration}ms`,
      stack: error.stack,
    });

    throw error;
  }
}

/**
 * Retrieves an order from Shopify by ID
 * Includes retry logic for resilience
 * 
 * @param {string|number} shopifyOrderId - Shopify order ID
 * @returns {Promise<Object|null>} Shopify order or null if not found
 */
async function getShopifyOrderById(shopifyOrderId) {
  const startTime = Date.now();
  
  logger.info('Fetching Shopify order', { shopifyOrderId });

  try {
    if (!shopifyOrderId) {
      throw new Error('Shopify order ID is required');
    }

    // Get order with retry logic
    const response = await retryWithBackoff(
      () => makeShopifyRequest('GET', `orders/${shopifyOrderId}.json`),
      {
        maxRetries: 3,
        timeout: 30000,
        operationName: 'Get Shopify Order',
        context: { shopifyOrderId },
      }
    );

    const duration = Date.now() - startTime;
    const order = response.order;

    logger.info('✅ Shopify order retrieved successfully', {
      shopifyOrderId: order.id,
      orderNumber: order.order_number,
      financialStatus: order.financial_status,
      fulfillmentStatus: order.fulfillment_status,
      duration: `${duration}ms`,
    });

    return order;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Handle 404 - order not found
    if (error.statusCode === 404) {
      logger.warn('Shopify order not found', {
        shopifyOrderId,
        duration: `${duration}ms`,
      });
      return null;
    }

    logger.error('❌ Failed to fetch Shopify order', {
      error: error.message,
      shopifyOrderId,
      statusCode: error.statusCode,
      duration: `${duration}ms`,
      stack: error.stack,
    });

    throw error;
  }
}

/**
 * Updates an order's financial status in Shopify
 * Used to mark orders as paid after payment confirmation
 * 
 * @param {string|number} shopifyOrderId - Shopify order ID
 * @param {string} financialStatus - New financial status ('paid', 'pending', 'refunded', etc.)
 * @param {Object} additionalData - Additional data to update
 * @returns {Promise<Object>} Updated Shopify order
 */
async function updateShopifyOrderStatus(shopifyOrderId, financialStatus, additionalData = {}) {
  const startTime = Date.now();
  
  logger.info('Updating Shopify order status', {
    shopifyOrderId,
    financialStatus,
  });

  try {
    if (!shopifyOrderId) {
      throw new Error('Shopify order ID is required');
    }

    if (!financialStatus) {
      throw new Error('Financial status is required');
    }

    const updateData = {
      id: shopifyOrderId,
      financial_status: financialStatus,
      ...additionalData,
    };

    // Update order with retry logic
    const response = await retryWithBackoff(
      () => makeShopifyRequest('PUT', `orders/${shopifyOrderId}.json`, { order: updateData }),
      {
        maxRetries: 3,
        timeout: 30000,
        operationName: 'Update Shopify Order Status',
        context: {
          shopifyOrderId,
          financialStatus,
        },
      }
    );

    const duration = Date.now() - startTime;
    const order = response.order;

    logger.info('✅ Shopify order status updated successfully', {
      shopifyOrderId: order.id,
      orderNumber: order.order_number,
      financialStatus: order.financial_status,
      duration: `${duration}ms`,
    });

    return order;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('❌ Failed to update Shopify order status', {
      error: error.message,
      shopifyOrderId,
      financialStatus,
      statusCode: error.statusCode,
      duration: `${duration}ms`,
      stack: error.stack,
    });

    throw error;
  }
}

/**
 * Confirms an order payment in Shopify
 * Creates a transaction record and updates financial status to 'paid'
 * 
 * @param {string|number} shopifyOrderId - Shopify order ID
 * @param {Object} paymentInfo - Payment information
 * @param {string} paymentInfo.gateway - Payment gateway (e.g., 'razorpay')
 * @param {string} paymentInfo.kind - Transaction kind (usually 'capture')
 * @param {number} paymentInfo.amount - Payment amount
 * @param {string} paymentInfo.currency - Currency code
 * @param {string} paymentInfo.authorization - Payment authorization ID
 * @returns {Promise<Object>} Updated Shopify order
 */
async function confirmShopifyOrderPayment(shopifyOrderId, paymentInfo) {
  const startTime = Date.now();
  
  logger.info('Confirming Shopify order payment', {
    shopifyOrderId,
    gateway: paymentInfo.gateway,
    amount: paymentInfo.amount,
    currency: paymentInfo.currency,
  });

  try {
    if (!shopifyOrderId) {
      throw new Error('Shopify order ID is required');
    }

    if (!paymentInfo.gateway || !paymentInfo.amount) {
      throw new Error('Payment gateway and amount are required');
    }

    // Create transaction to record payment
    const transactionData = {
      kind: paymentInfo.kind || 'capture',
      gateway: paymentInfo.gateway,
      amount: paymentInfo.amount,
      currency: paymentInfo.currency || 'INR',
      status: 'success',
      authorization: paymentInfo.authorization,
      test: config.server.nodeEnv !== 'production',
    };

    // Create transaction with retry logic
    const transactionResponse = await retryWithBackoff(
      () => makeShopifyRequest('POST', `orders/${shopifyOrderId}/transactions.json`, { 
        transaction: transactionData 
      }),
      {
        maxRetries: 3,
        timeout: 30000,
        operationName: 'Create Shopify Transaction',
        context: {
          shopifyOrderId,
          amount: paymentInfo.amount,
        },
      }
    );

    logger.info('Shopify transaction created', {
      shopifyOrderId,
      transactionId: transactionResponse.transaction?.id,
      status: transactionResponse.transaction?.status,
    });

    // Update order financial status to 'paid'
    const updatedOrder = await updateShopifyOrderStatus(shopifyOrderId, 'paid', {
      note: `Payment confirmed via ${paymentInfo.gateway} - ${paymentInfo.authorization}`,
    });

    const duration = Date.now() - startTime;

    logger.info('✅ Shopify order payment confirmed successfully', {
      shopifyOrderId,
      transactionId: transactionResponse.transaction?.id,
      financialStatus: updatedOrder.financial_status,
      duration: `${duration}ms`,
    });

    return {
      order: updatedOrder,
      transaction: transactionResponse.transaction,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('❌ Failed to confirm Shopify order payment', {
      error: error.message,
      shopifyOrderId,
      gateway: paymentInfo.gateway,
      amount: paymentInfo.amount,
      statusCode: error.statusCode,
      duration: `${duration}ms`,
      stack: error.stack,
    });

    throw error;
  }
}

module.exports = {
  createShopifyOrder,
  getShopifyOrderById,
  updateShopifyOrderStatus,
  confirmShopifyOrderPayment,
};

