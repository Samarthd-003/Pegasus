const logger = require('./logger');

/**
 * Retry configuration defaults
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  timeout: 30000, // 30 seconds
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'],
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * Determines if an error is retryable
 * @param {Error} error - The error to check
 * @param {Object} config - Retry configuration
 * @returns {boolean} True if the error is retryable
 */
function isRetryableError(error, config) {
  // Check for network errors
  if (error.code && config.retryableErrors.includes(error.code)) {
    return true;
  }

  // Check for HTTP status codes
  if (error.response && error.response.status) {
    return config.retryableStatusCodes.includes(error.response.status);
  }

  // Check for timeout errors
  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return true;
  }

  return false;
}

/**
 * Calculates the delay for the next retry using exponential backoff
 * @param {number} attemptNumber - The current attempt number (0-indexed)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attemptNumber, config) {
  const delay = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attemptNumber),
    config.maxDelay
  );
  
  // Add jitter (±25% randomization) to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  
  return Math.floor(delay + jitter);
}

/**
 * Delays execution for a specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise} The wrapped promise
 */
function withTimeout(promise, timeoutMs, operationName = 'Operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(`${operationName} timed out after ${timeoutMs}ms`);
        error.name = 'TimeoutError';
        error.timeout = timeoutMs;
        reject(error);
      }, timeoutMs);
    }),
  ]);
}

/**
 * Retries an async operation with exponential backoff
 * Logs each attempt and provides detailed error information
 * 
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry configuration options
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.initialDelay - Initial delay in milliseconds
 * @param {number} options.maxDelay - Maximum delay in milliseconds
 * @param {number} options.backoffMultiplier - Exponential backoff multiplier
 * @param {number} options.timeout - Timeout for each attempt in milliseconds
 * @param {string} options.operationName - Name of the operation for logging
 * @param {Object} options.context - Additional context for logging
 * @returns {Promise} Result of the function
 * @throws {Error} The last error if all retries fail
 */
async function retryWithBackoff(fn, options = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options };
  const operationName = config.operationName || 'Operation';
  const context = config.context || {};

  let lastError;
  let attempt = 0;

  logger.info(`Starting ${operationName} with retry`, {
    maxRetries: config.maxRetries,
    timeout: config.timeout,
    ...context,
  });

  while (attempt <= config.maxRetries) {
    try {
      const startTime = Date.now();

      logger.debug(`${operationName} attempt ${attempt + 1}/${config.maxRetries + 1}`, {
        attempt: attempt + 1,
        maxAttempts: config.maxRetries + 1,
        ...context,
      });

      // Execute with timeout
      const result = await withTimeout(
        fn(),
        config.timeout,
        operationName
      );

      const duration = Date.now() - startTime;

      logger.info(`✅ ${operationName} succeeded`, {
        attempt: attempt + 1,
        duration: `${duration}ms`,
        retriesUsed: attempt,
        ...context,
      });

      return result;
    } catch (error) {
      lastError = error;
      const duration = Date.now() - Date.now();

      logger.warn(`❌ ${operationName} attempt ${attempt + 1} failed`, {
        attempt: attempt + 1,
        maxAttempts: config.maxRetries + 1,
        error: error.message,
        errorCode: error.code,
        statusCode: error.response?.status,
        duration: `${duration}ms`,
        ...context,
      });

      // Check if we should retry
      const shouldRetry = attempt < config.maxRetries && isRetryableError(error, config);

      if (!shouldRetry) {
        if (attempt >= config.maxRetries) {
          logger.error(`❌ ${operationName} failed after ${attempt + 1} attempts`, {
            totalAttempts: attempt + 1,
            maxRetries: config.maxRetries,
            finalError: error.message,
            errorCode: error.code,
            statusCode: error.response?.status,
            ...context,
          });
        } else {
          logger.error(`❌ ${operationName} failed with non-retryable error`, {
            attempt: attempt + 1,
            error: error.message,
            errorCode: error.code,
            statusCode: error.response?.status,
            ...context,
          });
        }
        throw error;
      }

      // Calculate backoff delay
      const backoffDelay = calculateBackoff(attempt, config);

      logger.info(`⏳ Retrying ${operationName} after ${backoffDelay}ms`, {
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        backoffDelay: `${backoffDelay}ms`,
        ...context,
      });

      await delay(backoffDelay);
      attempt++;
    }
  }

  // This should never be reached, but just in case
  throw lastError;
}

/**
 * Creates a retry-enabled version of an async function
 * @param {Function} fn - Async function to wrap
 * @param {Object} defaultOptions - Default retry options
 * @returns {Function} Wrapped function with retry capability
 */
function createRetryableFunction(fn, defaultOptions = {}) {
  return async function(...args) {
    return retryWithBackoff(
      () => fn(...args),
      defaultOptions
    );
  };
}

module.exports = {
  retryWithBackoff,
  withTimeout,
  createRetryableFunction,
  isRetryableError,
  calculateBackoff,
  DEFAULT_RETRY_CONFIG,
};

