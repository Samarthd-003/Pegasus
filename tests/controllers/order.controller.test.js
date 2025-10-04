const request = require('supertest');
const app = require('../../src/app');
const orderService = require('../../src/services/order.service');

jest.mock('../../src/services/order.service');

describe('Order Controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create an order', async () => {
    const orderDetails = { productId: 'prod_123', amount: 100 };
    const mockOrder = { orderId: 'order_123', ...orderDetails, status: 'created' };
    orderService.createOrder.mockResolvedValue(mockOrder);

    const res = await request(app)
      .post('/api/orders')
      .send(orderDetails);

    expect(res.statusCode).toEqual(201);
    expect(res.body).toEqual(mockOrder);
    expect(orderService.createOrder).toHaveBeenCalledWith(orderDetails);
  });

  it('should get an order by ID', async () => {
    const mockOrder = { orderId: 'order_123', status: 'created' };
    orderService.getOrderById.mockResolvedValue(mockOrder);

    const res = await request(app).get('/api/orders/order_123');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual(mockOrder);
    expect(orderService.getOrderById).toHaveBeenCalledWith('order_123');
  });

  it('should return 404 if order not found', async () => {
    orderService.getOrderById.mockResolvedValue(null);

    const res = await request(app).get('/api/orders/non_existent_id');

    expect(res.statusCode).toEqual(404);
  });

  it('should handle webhook for payment captured', async () => {
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_123',
            order_id: 'order_123',
          },
        },
      },
    };
    orderService.verifyRazorpaySignature.mockReturnValue(true);

    const res = await request(app)
      .post('/api/orders/webhook')
      .set('x-razorpay-signature', 'valid_signature')
      .send(webhookPayload);

    expect(res.statusCode).toEqual(200);
    expect(orderService.persistPayment).toHaveBeenCalled();
    expect(orderService.updateOrderStatus).toHaveBeenCalledWith('order_123', 'paid');
  });

  it('should return 400 for invalid webhook signature', async () => {
    orderService.verifyRazorpaySignature.mockReturnValue(false);

    const res = await request(app)
      .post('/api/orders/webhook')
      .set('x-razorpay-signature', 'invalid_signature')
      .send({ event: 'payment.captured', payload: { payment: { entity: {} } } });

    expect(res.statusCode).toEqual(400);
  });
});
