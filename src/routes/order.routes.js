const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');

router.post('/', orderController.createOrder);
router.get('/:id', orderController.getOrderById);
router.post('/webhook', orderController.handleWebhook);

module.exports = router;
