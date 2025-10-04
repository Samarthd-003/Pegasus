const { create, getById, updateStatus } = require('../../src/controllers/orderController');
const { clearOrders } = require('../../src/services/orderService');

describe('OrderController', () => {
  beforeEach(() => {
    clearOrders();
  });

  describe('create', () => {
    it('should create order successfully', async () => {
      const req = {
        body: {
          amount: 50000,
          currency: 'INR',
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Order created successfully',
          data: expect.objectContaining({
            amount: 50000,
            status: 'created',
          }),
        })
      );
    });

    it('should handle errors gracefully', async () => {
      const req = {
        body: null,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await create(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to create order',
        })
      );
    });
  });

  describe('getById', () => {
    it('should get order by ID successfully', async () => {
      // First create an order
      const createReq = {
        body: { amount: 50000 },
      };
      const createRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      await create(createReq, createRes);
      const createdOrder = createRes.json.mock.calls[0][0].data;

      // Then fetch it
      const req = {
        params: { orderId: createdOrder.id },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: createdOrder.id,
            amount: 50000,
          }),
        })
      );
    });

    it('should return 404 for non-existent order', async () => {
      const req = {
        params: { orderId: 'non_existent' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Order not found',
        })
      );
    });
  });

  describe('updateStatus', () => {
    it('should update order status successfully', async () => {
      // First create an order
      const createReq = {
        body: { amount: 50000 },
      };
      const createRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      await create(createReq, createRes);
      const createdOrder = createRes.json.mock.calls[0][0].data;

      // Then update it
      const req = {
        params: { orderId: createdOrder.id },
        body: { status: 'paid', paymentId: 'pay_123' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await updateStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Order status updated successfully',
          data: expect.objectContaining({
            status: 'paid',
            paymentId: 'pay_123',
          }),
        })
      );
    });

    it('should handle errors gracefully', async () => {
      const req = {
        params: { orderId: 'non_existent' },
        body: { status: 'paid' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await updateStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to update order status',
        })
      );
    });
  });
});

