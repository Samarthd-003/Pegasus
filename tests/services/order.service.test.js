const orderService = require('../../src/services/order.service');
const logger = require('../../src/utils/logger');

// Mock the logger to prevent logs during tests
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Order Service', () => {
  beforeEach(() => {
    // Clear mock function calls before each test
    logger.info.mockClear();
  });

  it('should create an order', async () => {
    const orderDetails = { productId: 'prod_123', amount: 100 };
    const order = await orderService.createOrder(orderDetails);
    expect(order).toHaveProperty('orderId');
    expect(order.status).toEqual('created');
    expect(order.product.id).toEqual('prod_123');
    expect(logger.info).toHaveBeenCalledWith('Creating a new order');
  });

  it('should get an order by ID', async () => {
    const orderDetails = { productId: 'prod_456', amount: 200 };
    const createdOrder = await orderService.createOrder(orderDetails);
    const fetchedOrder = await orderService.getOrderById(createdOrder.orderId);
    expect(fetchedOrder).toEqual(createdOrder);
  });

  it('should return null for a non-existent order ID', async () => {
    const order = await orderService.getOrderById('non_existent_id');
    expect(order).toBeNull();
  });

  it('should update order status', async () => {
    const orderDetails = { productId: 'prod_789', amount: 300 };
    const order = await orderService.createOrder(orderDetails);
    const updatedOrder = await orderService.updateOrderStatus(order.orderId, 'paid');
    expect(updatedOrder.status).toEqual('paid');
  });

  it('should persist payment details', async () => {
    const orderDetails = { productId: 'prod_101', amount: 400 };
    const order = await orderService.createOrder(orderDetails);
    const paymentDetails = { id: 'pay_123', amount: 400, currency: 'USD' };
    const updatedOrder = await orderService.persistPayment(order.orderId, paymentDetails);
    expect(updatedOrder.paymentDetails).toEqual(paymentDetails);
  });
});
