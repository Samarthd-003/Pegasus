const {
  createOrder,
  getOrderById,
  updateOrderStatus,
  clearOrders,
} = require('../../src/services/orderService');

describe('OrderService', () => {
  beforeEach(() => {
    // Clear orders before each test
    clearOrders();
  });

  describe('createOrder', () => {
    it('should create an order successfully', async () => {
      const orderData = {
        amount: 50000,
        currency: 'INR',
        receipt: 'receipt_123',
        customer_email: 'test@example.com',
      };

      const order = await createOrder(orderData);

      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.amount).toBe(50000);
      expect(order.status).toBe('created');
      expect(order.razorpayOrderId).toBeDefined();
      expect(order.shopifyOrderId).toBeDefined();
      expect(order.createdAt).toBeDefined();
    });

    it('should throw error when amount is missing', async () => {
      const orderData = {
        currency: 'INR',
      };

      await expect(createOrder(orderData)).rejects.toThrow(
        'Invalid order data: amount is required'
      );
    });

    it('should throw error when orderData is null', async () => {
      await expect(createOrder(null)).rejects.toThrow(
        'Invalid order data: amount is required'
      );
    });

    it('should generate unique order IDs', async () => {
      const orderData1 = { amount: 1000 };
      const orderData2 = { amount: 2000 };

      const order1 = await createOrder(orderData1);
      const order2 = await createOrder(orderData2);

      expect(order1.id).not.toBe(order2.id);
    });
  });

  describe('getOrderById', () => {
    it('should retrieve an existing order', async () => {
      const orderData = {
        amount: 50000,
        currency: 'INR',
      };

      const createdOrder = await createOrder(orderData);
      const retrievedOrder = await getOrderById(createdOrder.id);

      expect(retrievedOrder).toBeDefined();
      expect(retrievedOrder.id).toBe(createdOrder.id);
      expect(retrievedOrder.amount).toBe(50000);
    });

    it('should return null for non-existent order', async () => {
      const order = await getOrderById('non_existent_id');
      expect(order).toBeNull();
    });

    it('should throw error when orderId is not provided', async () => {
      await expect(getOrderById(null)).rejects.toThrow('Order ID is required');
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status successfully', async () => {
      const orderData = { amount: 50000 };
      const createdOrder = await createOrder(orderData);

      const updatedOrder = await updateOrderStatus(createdOrder.id, 'paid', {
        paymentId: 'pay_123',
      });

      expect(updatedOrder.status).toBe('paid');
      expect(updatedOrder.paymentId).toBe('pay_123');
      expect(updatedOrder.updatedAt).toBeDefined();
      expect(updatedOrder.updatedAt).not.toBe(createdOrder.updatedAt);
    });

    it('should throw error for non-existent order', async () => {
      await expect(
        updateOrderStatus('non_existent_id', 'paid')
      ).rejects.toThrow('Order not found: non_existent_id');
    });

    it('should update order with multiple additional fields', async () => {
      const orderData = { amount: 50000 };
      const createdOrder = await createOrder(orderData);

      const updatedOrder = await updateOrderStatus(createdOrder.id, 'completed', {
        paymentId: 'pay_123',
        completedAt: '2023-10-01T12:00:00Z',
        notes: 'Order completed successfully',
      });

      expect(updatedOrder.status).toBe('completed');
      expect(updatedOrder.paymentId).toBe('pay_123');
      expect(updatedOrder.completedAt).toBe('2023-10-01T12:00:00Z');
      expect(updatedOrder.notes).toBe('Order completed successfully');
    });
  });
});

