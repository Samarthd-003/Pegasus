const logger = require('../utils/logger');
const { createOrder, getOrderById, updateOrderStatus } = require('../services/orderService');

/**
 * Create a new order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function create(req, res) {
  try {
    logger.info('Create order request received', { body: req.body });

    const orderData = req.body;
    const order = await createOrder(orderData);

    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully',
    });
  } catch (error) {
    logger.error('Error in create order controller', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to create order',
    });
  }
}

/**
 * Get order by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getById(req, res) {
  try {
    const { orderId } = req.params;
    logger.info('Get order request received', { orderId });

    const order = await getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error('Error in get order controller', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to fetch order',
    });
  }
}

/**
 * Update order status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { status, ...additionalData } = req.body;

    logger.info('Update order status request received', { orderId, status });

    const order = await updateOrderStatus(orderId, status, additionalData);

    res.status(200).json({
      success: true,
      data: order,
      message: 'Order status updated successfully',
    });
  } catch (error) {
    logger.error('Error in update order status controller', {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to update order status',
    });
  }
}

module.exports = {
  create,
  getById,
  updateStatus,
};

