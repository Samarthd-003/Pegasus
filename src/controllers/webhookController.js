const logger = require('../utils/logger');
const { handleWebhook } = require('../services/webhookService');
const { SignatureVerificationError, ValidationError } = require('../utils/errors');

/**
 * Handle Razorpay webhook with signature verification and idempotency
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function razorpayWebhook(req, res) {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  
  try {
    logger.info('Razorpay webhook received', {
      requestId,
      hasSignature: !!req.headers['x-razorpay-signature'],
      contentType: req.headers['content-type'],
      bodyLength: req.rawBody?.length,
    });

    // Extract signature from headers
    const signature = req.headers['x-razorpay-signature'];
    const webhookPayload = req.body;
    const rawBody = req.rawBody; // Raw body attached by middleware

    // Validate required data
    if (!rawBody) {
      logger.error('Raw body not available for signature verification', { requestId });
      return res.status(400).json({
        success: false,
        error: 'Raw body required for signature verification',
        message: 'Webhook processing failed',
      });
    }

    // Process webhook with signature verification and idempotency handling
    const result = await handleWebhook(webhookPayload, signature, rawBody, req.headers);

    // Check if this was a duplicate request
    if (result.duplicate) {
      logger.info('Duplicate webhook request processed', {
        requestId,
        idempotencyKey: result.idempotencyKey,
      });
      return res.status(200).json({
        success: true,
        data: result,
        message: 'Webhook already processed (duplicate)',
      });
    }

    logger.info('Webhook processed successfully', {
      requestId,
      event: result.event,
      idempotencyKey: result.idempotencyKey,
    });

    res.status(200).json({
      success: true,
      data: result,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    // Handle signature verification errors
    if (error instanceof SignatureVerificationError) {
      logger.error('Signature verification failed', {
        requestId,
        error: error.message,
        context: error.context,
      });
      return res.status(401).json({
        success: false,
        error: 'Signature verification failed',
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && { 
          context: error.context,
        }),
      });
    }

    // Handle validation errors
    if (error instanceof ValidationError) {
      logger.error('Validation error', {
        requestId,
        error: error.message,
        context: error.context,
      });
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && { 
          context: error.context,
        }),
      });
    }

    // Handle all other errors
    logger.error('Error processing Razorpay webhook', {
      requestId,
      error: error.message,
      errorType: error.name,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to process webhook',
    });
  }
}

module.exports = {
  razorpayWebhook,
};

