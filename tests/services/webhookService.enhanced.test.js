const crypto = require('crypto');
const {
  handleWebhook,
  handlePaymentAuthorized,
  handlePaymentCaptured,
  handlePaymentFailed,
  handleOrderPaid,
} = require('../../src/services/webhookService');
const { createOrder, clearOrders } = require('../../src/services/orderService');
const { persistPayment, clearPayments } = require('../../src/services/paymentService');
const { clearProcessedKeys } = require('../../src/utils/idempotency');
const { SignatureVerificationError, WebhookProcessingError } = require('../../src/utils/errors');

// Mock payment service to track calls
jest.mock('../../src/services/paymentService', () => {
  const actual = jest.requireActual('../../src/services/paymentService');
  return {
    ...actual,
    persistPayment: jest.fn(actual.persistPayment),
  };
});

// Mock order service to track calls
jest.mock('../../src/services/orderService', () => {
  const actual = jest.requireActual('../../src/services/orderService');
  return {
    ...actual,
    updateOrderStatus: jest.fn(actual.updateOrderStatus),
  };
});

describe('WebhookService - Enhanced handleWebhook', () => {
  const webhookSecret = 'test_webhook_secret';

  beforeEach(() => {
    clearOrders();
    clearPayments();
    clearProcessedKeys();
    jest.clearAllMocks();
  });

  describe('Webhook Flow: received → validated → applied', () => {
    it('should log all three phases for successful webhook', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_success_flow',
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
        'x-idempotency-key': 'flow_test_key',
      };

      await createOrder({ amount: 50000 });

      const result = await handleWebhook(webhookPayload, signature, rawBody, headers);

      expect(result.processed).toBe(true);
      expect(result.event).toBe('payment.captured');
      expect(result.idempotencyKey).toBe('flow_test_key');
      expect(persistPayment).toHaveBeenCalledTimes(1);
    });

    it('should fail at validation phase with invalid signature', async () => {
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

      // Ensure persistPayment was NOT called after validation failure
      expect(persistPayment).not.toHaveBeenCalled();
    });

    it('should skip at APPLIED phase if duplicate detected', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_duplicate',
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

      const headers = {
        'x-idempotency-key': 'duplicate_key_test',
      };

      await createOrder({ amount: 50000 });

      // First request
      const result1 = await handleWebhook(webhookPayload, signature, rawBody, headers);
      expect(result1.processed).toBe(true);
      expect(persistPayment).toHaveBeenCalledTimes(1);

      // Clear mock to check second call
      jest.clearAllMocks();

      // Second request - should skip
      const result2 = await handleWebhook(webhookPayload, signature, rawBody, headers);
      expect(result2.duplicate).toBe(true);
      expect(persistPayment).not.toHaveBeenCalled(); // Should not persist again
    });
  });

  describe('Event Parsing and Validation', () => {
    it('should throw error when event type is missing', async () => {
      const webhookPayload = {
        entity: 'event',
        // event is missing
        payload: { payment: { entity: { id: 'pay_123' } } },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      await expect(
        handleWebhook(webhookPayload, signature, rawBody, {})
      ).rejects.toThrow(WebhookProcessingError);

      expect(persistPayment).not.toHaveBeenCalled();
    });

    it('should throw error when payload is missing', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        // payload is missing
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      await expect(
        handleWebhook(webhookPayload, signature, rawBody, {})
      ).rejects.toThrow(WebhookProcessingError);

      expect(persistPayment).not.toHaveBeenCalled();
    });
  });

  describe('payment.captured Event with Mocked API', () => {
    it('should call persistPayment with correct data', async () => {
      const paymentEntity = {
        id: 'pay_captured_123',
        order_id: 'order_456',
        amount: 75000,
        currency: 'INR',
        status: 'captured',
        method: 'card',
      };

      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: paymentEntity,
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      await createOrder({ amount: 75000 });

      const result = await handleWebhook(webhookPayload, signature, rawBody, {});

      expect(result.processed).toBe(true);
      expect(persistPayment).toHaveBeenCalledTimes(1);
      expect(persistPayment).toHaveBeenCalledWith(paymentEntity);
    });

    it('should call updateOrderStatus after persistPayment', async () => {
      const paymentEntity = {
        id: 'pay_order_update',
        order_id: 'order_789',
        amount: 100000,
        currency: 'INR',
        status: 'captured',
      };

      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: paymentEntity,
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      await createOrder({ amount: 100000 });

      await handleWebhook(webhookPayload, signature, rawBody, {});

      expect(persistPayment).toHaveBeenCalledTimes(1);
      
      // Verify updateOrderStatus was called after persistPayment
      const updateOrderStatus = require('../../src/services/orderService').updateOrderStatus;
      expect(updateOrderStatus).toHaveBeenCalledTimes(1);
      expect(updateOrderStatus).toHaveBeenCalledWith(
        'order_789',
        'paid',
        expect.objectContaining({
          paymentId: 'pay_order_update',
          amount: 100000,
          currency: 'INR',
        })
      );
    });

    it('should not update order status if order_id is missing', async () => {
      const paymentEntity = {
        id: 'pay_no_order',
        // order_id is missing
        amount: 50000,
        status: 'captured',
      };

      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: paymentEntity,
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const result = await handleWebhook(webhookPayload, signature, rawBody, {});

      expect(result.processed).toBe(true);
      expect(persistPayment).toHaveBeenCalledTimes(1);
      
      const updateOrderStatus = require('../../src/services/orderService').updateOrderStatus;
      expect(updateOrderStatus).not.toHaveBeenCalled();
    });

    it('should throw error if payment ID is missing', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              // id is missing
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

      await expect(
        handleWebhook(webhookPayload, signature, rawBody, {})
      ).rejects.toThrow(WebhookProcessingError);

      expect(persistPayment).not.toHaveBeenCalled();
    });

    it('should throw error if payment entity structure is invalid', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            // entity is missing
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      await expect(
        handleWebhook(webhookPayload, signature, rawBody, {})
      ).rejects.toThrow(WebhookProcessingError);

      expect(persistPayment).not.toHaveBeenCalled();
    });
  });

  describe('payment.failed Event Error Handling', () => {
    it('should persist failed payment with failure reason', async () => {
      const paymentEntity = {
        id: 'pay_failed_123',
        order_id: 'order_fail',
        amount: 50000,
        status: 'failed',
        error_code: 'BAD_REQUEST_ERROR',
        error_description: 'Payment failed due to insufficient funds',
      };

      const webhookPayload = {
        entity: 'event',
        event: 'payment.failed',
        payload: {
          payment: {
            entity: paymentEntity,
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      await createOrder({ amount: 50000 });

      const result = await handleWebhook(webhookPayload, signature, rawBody, {});

      expect(result.processed).toBe(true);
      expect(result.failureReason).toBe('Payment failed due to insufficient funds');
      expect(persistPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pay_failed_123',
          status: 'failed',
          failureReason: 'Payment failed due to insufficient funds',
        })
      );
    });

    it('should log errors but not prevent webhook completion', async () => {
      const paymentEntity = {
        id: 'pay_error_test',
        amount: 50000,
        status: 'failed',
        error_description: 'Test error',
      };

      const webhookPayload = {
        entity: 'event',
        event: 'payment.failed',
        payload: {
          payment: {
            entity: paymentEntity,
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const result = await handleWebhook(webhookPayload, signature, rawBody, {});

      expect(result.processed).toBe(true);
      expect(result.event).toBe('payment.failed');
    });
  });

  describe('Unhandled Event Types', () => {
    it('should return processed: false for unhandled events', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.unknown',
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
      expect(result.event).toBe('payment.unknown');
      expect(persistPayment).not.toHaveBeenCalled();
    });
  });

  describe('Error Propagation', () => {
    it('should propagate errors from persistPayment', async () => {
      persistPayment.mockRejectedValueOnce(new Error('Database connection failed'));

      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_db_error',
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

      await expect(
        handleWebhook(webhookPayload, signature, rawBody, {})
      ).rejects.toThrow('Database connection failed');
    });

    it('should wrap non-webhook errors in WebhookProcessingError', async () => {
      persistPayment.mockRejectedValueOnce(new Error('Unexpected error'));

      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_unexpected',
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

      await expect(
        handleWebhook(webhookPayload, signature, rawBody, {})
      ).rejects.toThrow();
    });
  });
});

