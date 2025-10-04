const logger = require('../utils/logger');
const { handleWebhook } = require('../services/webhookService');

/**
 * Handle Razorpay webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function razorpayWebhook(req, res) {
  try {
    logger.info('Razorpay webhook received');

    const signature = req.headers['x-razorpay-signature'];
    const webhookPayload = req.body;
    const rawBody = req.rawBody; // Assuming raw body is attached by middleware

    const result = await handleWebhook(webhookPayload, signature, rawBody);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    logger.error('Error processing Razorpay webhook', { error: error.message });
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

