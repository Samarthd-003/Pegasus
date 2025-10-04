const request = require('supertest');
const app = require('../../src/app');

describe('Health Routes', () => {
  it('should return 200 and status UP for GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('status', 'UP');
  });
});
