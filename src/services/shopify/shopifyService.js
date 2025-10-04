const logger = require('../../utils/logger');

const TIMEOUT = 5000; // 5 seconds

const withTimeout = (promise, ms) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms} ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

const withRetries = async (asyncFn, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await asyncFn();
    } catch (error) {
      if (i === retries - 1) {
        throw error;
      }
      await new Promise((res) => setTimeout(res, delay * (i + 1)));
    }
  }
};

const createShopifyOrder = async (orderDetails) => {
  const apiCall = async () => {
    logger.info('Creating Shopify order', { orderDetails });
    // Mock API call to Shopify
    await new Promise((res) => setTimeout(res, 100)); // Simulate network delay
    if (Math.random() > 0.9) { // 10% chance of failure
      throw new Error('Shopify API is down');
    }
    const shopifyOrder = {
      id: `sh_ord_${Date.now()}`,
      ...orderDetails,
      status: 'created',
    };
    logger.info('Shopify order created', { shopifyOrder });
    return shopifyOrder;
  };
  return withTimeout(withRetries(apiCall), TIMEOUT);
};

const getShopifyOrder = async (orderId) => {
  const apiCall = async () => {
    logger.info('Getting Shopify order', { orderId });
    // Mock API call to Shopify
    await new Promise((res) => setTimeout(res, 100));
    return { id: orderId, status: 'created', line_items: [] };
  };
  return withTimeout(withRetries(apiCall), TIMEOUT);
};


module.exports = {
  createShopifyOrder,
  getShopifyOrder,
};
