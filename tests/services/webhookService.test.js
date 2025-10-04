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

describe('WebhookService', () => {
  const webhookSecret = 'test_webhook_secret';

  beforeEach(() => {
    clearOrders();
    clearPayments();
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

      // Create order first
      await createOrder({ amount: 50000 });

      const result = await handleWebhook(webhookPayload, signature, rawBody);

      expect(result.processed).toBe(true);
      expect(result.event).toBe('payment.captured');
      expect(result.paymentId).toBe('pay_123');
    });

    it('should throw error for invalid signature', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {},
      };

      const rawBody = JSON.stringify(webhookPayload);
      const invalidSignature = 'invalid_signature';

      await expect(
        handleWebhook(webhookPayload, invalidSignature, rawBody)
      ).rejects.toThrow('Invalid webhook signature');
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

      const result = await handleWebhook(webhookPayload, signature, rawBody);

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Unhandled event');
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

