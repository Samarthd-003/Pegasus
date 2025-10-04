const express = require('express');
const healthController = require('../controllers/healthController');
const orderController = require('../controllers/orderController');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

// Health check endpoint
router.get('/health', healthController.healthCheck);

// Order endpoints
router.post('/orders', orderController.create);
router.get('/orders/:orderId', orderController.getById);
router.patch('/orders/:orderId/status', orderController.updateStatus);

// Webhook endpoints
router.post('/webhooks/razorpay', webhookController.razorpayWebhook);

module.exports = router;

