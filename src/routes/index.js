const express = require('express');
const router = express.Router();

const orderRoutes = require('./order.routes');
const healthRoutes = require('./health.routes');

router.use('/orders', orderRoutes);
router.use('/health', healthRoutes);

module.exports = router;
