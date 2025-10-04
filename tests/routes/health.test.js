const request = require('supertest');
const { app, server } = require('../../src/index');

afterAll((done) => {
  server.close(done);
});

describe('GET /health', () => {
  it('should return 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'UP' });
  });
});
