const crypto = require('crypto');
const {
  handleWebhook,
  handlePaymentAuthorized,
  handlePaymentCaptured,
  handlePaymentFailed,
  handleOrderPaid,
} = require('../../src/services/webhookService');
const { createOrder, clearOrders } = require('../../src/services/orderService');
const { clearPayments } = require('../../src/services/paymentService');
const { clearProcessedKeys } = require('../../src/utils/idempotency');
const { SignatureVerificationError } = require('../../src/utils/errors');

describe('WebhookService', () => {
  const webhookSecret = 'test_webhook_secret';

  beforeEach(() => {
    clearOrders();
    clearPayments();
    clearProcessedKeys();
  });

  describe('handleWebhook', () => {
    it('should process payment.captured webhook successfully', async () => {
      const webhookPayload = {
        entity: 'event',
        account_id: 'acc_123',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              order_id: 'order_123',
              amount: 50000,
              currency: 'INR',
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

      const headers = {
        'x-idempotency-key': 'test_key_123',
      };

      // Create order first
      await createOrder({ amount: 50000 });

      const result = await handleWebhook(webhookPayload, signature, rawBody, headers);

      expect(result.processed).toBe(true);
      expect(result.event).toBe('payment.captured');
      expect(result.paymentId).toBe('pay_123');
      expect(result.idempotencyKey).toBe('test_key_123');
    });

    it('should throw SignatureVerificationError for invalid signature', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {},
      };

      const rawBody = JSON.stringify(webhookPayload);
      const invalidSignature = 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yzabcdef';

      await expect(
        handleWebhook(webhookPayload, invalidSignature, rawBody, {})
      ).rejects.toThrow(SignatureVerificationError);
    });

    it('should handle unhandled event types', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'unknown.event',
        payload: {},
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const result = await handleWebhook(webhookPayload, signature, rawBody, {});

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Unhandled event');
    });

    it('should detect and return duplicate webhook requests', async () => {
      const webhookPayload = {
        entity: 'event',
        account_id: 'acc_123',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_duplicate',
              order_id: 'order_123',
              amount: 50000,
              currency: 'INR',
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

      const headers = {
        'x-idempotency-key': 'duplicate_key_123',
      };

      // Create order first
      await createOrder({ amount: 50000 });

      // First request - should process normally
      const result1 = await handleWebhook(webhookPayload, signature, rawBody, headers);
      expect(result1.processed).toBe(true);
      expect(result1.duplicate).toBeUndefined();

      // Second request with same idempotency key - should detect duplicate
      const result2 = await handleWebhook(webhookPayload, signature, rawBody, headers);
      expect(result2.duplicate).toBe(true);
      expect(result2.message).toContain('already processed');
    });

    it('should generate idempotency key when not provided', async () => {
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

      await createOrder({ amount: 30000 });

      const result = await handleWebhook(webhookPayload, signature, rawBody, {});

      expect(result.idempotencyKey).toBeDefined();
      expect(result.idempotencyKey).toMatch(/^generated_/);
    });

    it('should extract idempotency key from Razorpay payment structure', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_789',
              order_id: 'order_789',
              amount: 20000,
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

      await createOrder({ amount: 20000 });

      const result = await handleWebhook(webhookPayload, signature, rawBody, {});

      expect(result.idempotencyKey).toBe('payment.captured_pay_789');
    });
  });

  describe('handlePaymentAuthorized', () => {
    it('should handle payment authorized event', async () => {
      const payload = {
        payment: {
          entity: {
            id: 'pay_123',
            order_id: 'order_123',
            amount: 50000,
            status: 'authorized',
          },
        },
      };

      // Create order first
      await createOrder({ amount: 50000 });

      const result = await handlePaymentAuthorized(payload);

      expect(result.processed).toBe(true);
      expect(result.event).toBe('payment.authorized');
      expect(result.paymentId).toBe('pay_123');
    });
  });

  describe('handlePaymentCaptured', () => {
    it('should handle payment captured event', async () => {
      const payload = {
        payment: {
          entity: {
            id: 'pay_123',
            order_id: 'order_123',
            amount: 50000,
            status: 'captured',
          },
        },
      };

      // Create order first
      await createOrder({ amount: 50000 });

      const result = await handlePaymentCaptured(payload);

      expect(result.processed).toBe(true);
      expect(result.event).toBe('payment.captured');
      expect(result.paymentId).toBe('pay_123');
    });
  });

  describe('handlePaymentFailed', () => {
    it('should handle payment failed event', async () => {
      const payload = {
        payment: {
          entity: {
            id: 'pay_123',
            order_id: 'order_123',
            amount: 50000,
            status: 'failed',
            error_description: 'Insufficient funds',
          },
        },
      };

      // Create order first
      await createOrder({ amount: 50000 });

      const result = await handlePaymentFailed(payload);

      expect(result.processed).toBe(true);
      expect(result.event).toBe('payment.failed');
      expect(result.paymentId).toBe('pay_123');
    });
  });

  describe('handleOrderPaid', () => {
    it('should handle order paid event', async () => {
      const order = await createOrder({ amount: 50000 });

      const payload = {
        order: {
          entity: {
            id: order.id,
            amount: 50000,
            status: 'paid',
          },
        },
      };

      const result = await handleOrderPaid(payload);

      expect(result.processed).toBe(true);
      expect(result.event).toBe('order.paid');
      expect(result.orderId).toBe(order.id);
    });
  });
});

