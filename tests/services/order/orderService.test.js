const orderService = require('../../../src/services/order/orderService');

describe('Order Service', () => {
  it('should create an order', async () => {
    const orderDetails = { item: 'Test Item', quantity: 1 };
    const order = await orderService.createOrder(orderDetails);
    expect(order).toHaveProperty('id');
    expect(order.item).toBe('Test Item');
  });

  it('should get an order by id', async () => {
    const order = await orderService.getOrderById('order123');
    expect(order).toEqual({ id: 'order123', status: 'created' });
  });

  it('should update an order status', async () => {
    const order = await orderService.updateOrderStatus('order123', 'paid');
    expect(order).toEqual({ id: 'order123', status: 'paid' });
  });
});
