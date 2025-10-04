/**
 * Custom error classes for better error handling and type checking
 */

/**
 * Base error class for Pegasus service errors
 */
class PegasusError extends Error {
  constructor(message, statusCode = 500, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error for invalid webhook signatures
 */
class SignatureVerificationError extends PegasusError {
  constructor(message = 'Invalid webhook signature', context = {}) {
    super(message, 401, context);
  }
}

/**
 * Error for missing required data
 */
class ValidationError extends PegasusError {
  constructor(message = 'Validation failed', context = {}) {
    super(message, 400, context);
  }
}

/**
 * Error for webhook processing failures
 */
class WebhookProcessingError extends PegasusError {
  constructor(message = 'Webhook processing failed', context = {}) {
    super(message, 500, context);
  }
}

/**
 * Error for payment processing failures
 */
class PaymentProcessingError extends PegasusError {
  constructor(message = 'Payment processing failed', context = {}) {
    super(message, 500, context);
  }
}

module.exports = {
  PegasusError,
  SignatureVerificationError,
  ValidationError,
  WebhookProcessingError,
  PaymentProcessingError,
};

