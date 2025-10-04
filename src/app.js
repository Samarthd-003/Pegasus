const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors());

// Request logging middleware
app.use(requestLogger);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Pegasus Payment Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      createOrder: 'POST /api/orders',
      getOrder: 'GET /api/orders/:orderId',
      updateOrderStatus: 'PATCH /api/orders/:orderId/status',
      razorpayWebhook: 'POST /api/webhooks/razorpay',
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;

