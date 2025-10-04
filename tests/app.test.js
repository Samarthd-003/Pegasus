const request = require('supertest');
const app = require('../src/app');

describe('Express App', () => {
  describe('GET /', () => {
    it('should return service information', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body.service).toBe('Pegasus Payment Service');
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('service', 'pegasus-payment-service');
    });
  });

  describe('POST /api/orders', () => {
    it('should create a new order', async () => {
      const orderData = {
        amount: 50000,
        currency: 'INR',
        receipt: 'receipt_123',
      };

      const response = await request(app).post('/api/orders').send(orderData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('status', 'created');
      expect(response.body.data.amount).toBe(50000);
    });

    it('should handle invalid order data', async () => {
      const response = await request(app).post('/api/orders').send({});

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/orders/:orderId', () => {
    it('should return 404 for non-existent order', async () => {
      const response = await request(app).get('/api/orders/non_existent');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message', 'Order not found');
    });
  });

  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown/route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message', 'Route not found');
    });
  });
});

