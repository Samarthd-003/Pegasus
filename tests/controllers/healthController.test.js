const { healthCheck } = require('../../src/controllers/healthController');

describe('HealthController', () => {
  describe('healthCheck', () => {
    it('should return health status successfully', () => {
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      healthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          service: 'pegasus-payment-service',
          version: '1.0.0',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          environment: expect.any(String),
        })
      );
    });

    it('should include current timestamp', () => {
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const beforeTime = new Date().toISOString();
      healthCheck(req, res);
      const afterTime = new Date().toISOString();

      const healthStatus = res.json.mock.calls[0][0];
      expect(healthStatus.timestamp).toBeDefined();
      expect(healthStatus.timestamp >= beforeTime).toBe(true);
      expect(healthStatus.timestamp <= afterTime).toBe(true);
    });

    it('should include process uptime', () => {
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      healthCheck(req, res);

      const healthStatus = res.json.mock.calls[0][0];
      expect(healthStatus.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});

