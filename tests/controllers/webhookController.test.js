const crypto = require('crypto');
const { razorpayWebhook } = require('../../src/controllers/webhookController');
const { clearOrders, createOrder } = require('../../src/services/orderService');
const { clearPayments } = require('../../src/services/paymentService');
const { clearProcessedKeys } = require('../../src/utils/idempotency');

describe('WebhookController', () => {
  const webhookSecret = 'test_webhook_secret';

  beforeEach(() => {
    clearOrders();
    clearPayments();
    clearProcessedKeys();
  });

  describe('razorpayWebhook', () => {
    it('should process valid webhook with signature', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              order_id: 'order_123',
              amount: 50000,
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const req = {
        headers: {
          'x-razorpay-signature': signature,
          'x-idempotency-key': 'test_key_123',
        },
        body: webhookPayload,
        rawBody,
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await createOrder({ amount: 50000 });
      await razorpayWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Webhook processed successfully',
          data: expect.objectContaining({
            processed: true,
            event: 'payment.captured',
            idempotencyKey: 'test_key_123',
          }),
        })
      );
    });

    it('should return 401 for invalid signature', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {},
      };

      const rawBody = JSON.stringify(webhookPayload);
      const invalidSignature = 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yzabcdef';

      const req = {
        headers: {
          'x-razorpay-signature': invalidSignature,
        },
        body: webhookPayload,
        rawBody,
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await razorpayWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Signature verification failed',
        })
      );
    });

    it('should return 400 when raw body is missing', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {},
      };

      const req = {
        headers: {
          'x-razorpay-signature': 'some_signature',
        },
        body: webhookPayload,
        rawBody: null, // Missing raw body
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await razorpayWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Raw body required for signature verification',
        })
      );
    });

    it('should handle duplicate webhooks', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_duplicate',
              order_id: 'order_dup',
              amount: 50000,
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const req = {
        headers: {
          'x-razorpay-signature': signature,
          'x-idempotency-key': 'duplicate_key',
        },
        body: webhookPayload,
        rawBody,
      };

      const res1 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const res2 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await createOrder({ amount: 50000 });

      // First request
      await razorpayWebhook(req, res1);
      expect(res1.status).toHaveBeenCalledWith(200);
      expect(res1.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            processed: true,
          }),
        })
      );

      // Second request with same idempotency key
      await razorpayWebhook(req, res2);
      expect(res2.status).toHaveBeenCalledWith(200);
      expect(res2.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Webhook already processed (duplicate)',
          data: expect.objectContaining({
            duplicate: true,
          }),
        })
      );
    });

    it('should generate request ID when not provided', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_456',
              order_id: 'order_456',
              amount: 30000,
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const req = {
        headers: {
          'x-razorpay-signature': signature,
          // No x-request-id provided
        },
        body: webhookPayload,
        rawBody,
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await createOrder({ amount: 30000 });
      await razorpayWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // Should still process successfully
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should include context in development mode for errors', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const webhookPayload = { event: 'test' };
      const rawBody = JSON.stringify(webhookPayload);

      const req = {
        headers: {
          'x-razorpay-signature': 'invalid',
        },
        body: webhookPayload,
        rawBody,
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await razorpayWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          context: expect.any(Object),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle missing signature', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {},
      };

      const rawBody = JSON.stringify(webhookPayload);

      const req = {
        headers: {
          // No signature
        },
        body: webhookPayload,
        rawBody,
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await razorpayWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Signature verification failed',
        })
      );
    });
  });
});

