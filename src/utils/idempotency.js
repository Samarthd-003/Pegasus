const logger = require('./logger');

/**
 * Extracts idempotency key from webhook request
 * Checks both headers and body for idempotency identifiers
 * 
 * @param {Object} headers - Request headers object
 * @param {Object} body - Parsed request body
 * @returns {string|null} Idempotency key or null if not found
 */
function extractIdempotencyKey(headers, body) {
  logger.debug('Extracting idempotency key', {
    hasHeaders: !!headers,
    hasBody: !!body,
  });

  // Priority 1: Check for standard idempotency headers
  const idempotencyHeaders = [
    'x-idempotency-key',
    'idempotency-key',
    'x-request-id',
    'request-id',
    'x-razorpay-event-id', // Razorpay specific
  ];

  for (const headerName of idempotencyHeaders) {
    const headerValue = headers?.[headerName] || headers?.[headerName.toLowerCase()];
    if (headerValue) {
      logger.info('Idempotency key found in headers', {
        header: headerName,
        keyLength: headerValue.length,
      });
      return headerValue;
    }
  }

  // Priority 2: Check body for event ID or unique identifiers
  if (body) {
    // Razorpay event ID
    if (body.event_id) {
      logger.info('Idempotency key found in body.event_id', {
        keyLength: body.event_id.length,
      });
      return body.event_id;
    }

    // Razorpay webhook structure
    if (body.payload?.payment?.entity?.id) {
      const paymentId = body.payload.payment.entity.id;
      const event = body.event || 'unknown';
      const idempotencyKey = `${event}_${paymentId}`;
      logger.info('Generated idempotency key from payment event', {
        event,
        paymentId,
      });
      return idempotencyKey;
    }

    // Generic event structure
    if (body.id) {
      logger.info('Idempotency key found in body.id', {
        keyLength: body.id.length,
      });
      return body.id;
    }
  }

  logger.warn('No idempotency key found in request');
  return null;
}

/**
 * Generates a unique idempotency key based on request data
 * Used as fallback when no key is provided
 * 
 * @param {Object} data - Data to generate key from
 * @returns {string} Generated idempotency key
 */
function generateIdempotencyKey(data) {
  const crypto = require('crypto');
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .substring(0, 32);
  
  logger.info('Generated fallback idempotency key', {
    keyLength: hash.length,
  });
  
  return `generated_${hash}`;
}

/**
 * In-memory store for processed idempotency keys
 * In production, use Redis or database
 */
const processedKeys = new Map();

/**
 * Checks if an idempotency key has been processed
 * 
 * @param {string} key - Idempotency key
 * @returns {boolean} True if already processed
 */
function isKeyProcessed(key) {
  return processedKeys.has(key);
}

/**
 * Marks an idempotency key as processed
 * 
 * @param {string} key - Idempotency key
 * @param {Object} result - Processing result to cache
 * @param {number} ttl - Time to live in milliseconds (default: 24 hours)
 */
function markKeyProcessed(key, result, ttl = 24 * 60 * 60 * 1000) {
  processedKeys.set(key, {
    result,
    processedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttl).toISOString(),
  });

  // Auto-cleanup after TTL
  setTimeout(() => {
    processedKeys.delete(key);
    logger.debug('Idempotency key expired and removed', { key });
  }, ttl);

  logger.info('Idempotency key marked as processed', {
    key,
    expiresIn: `${ttl}ms`,
  });
}

/**
 * Gets the cached result for a processed key
 * 
 * @param {string} key - Idempotency key
 * @returns {Object|null} Cached result or null
 */
function getProcessedResult(key) {
  const cached = processedKeys.get(key);
  return cached ? cached.result : null;
}

/**
 * Clears all processed keys (for testing)
 */
function clearProcessedKeys() {
  processedKeys.clear();
}

module.exports = {
  extractIdempotencyKey,
  generateIdempotencyKey,
  isKeyProcessed,
  markKeyProcessed,
  getProcessedResult,
  clearProcessedKeys,
};

