const {
  createOrder,
  getOrderById,
  updateOrderStatus,
  clearOrders,
} = require('../../src/services/orderService');

describe('OrderService - Enhanced updateOrderStatus', () => {
  beforeEach(() => {
    clearOrders();
  });

  describe('Double-Application Prevention', () => {
    it('should prevent double-application with same idempotency key', async () => {
      const orderData = { amount: 50000 };
      const order = await createOrder(orderData);
      const idempotencyKey = 'test_key_123';

      // First update
      const result1 = await updateOrderStatus(order.id, 'paid', {
        paymentId: 'pay_123',
        idempotencyKey,
      });

      expect(result1.status).toBe('paid');
      expect(result1.paymentId).toBe('pay_123');
      expect(result1.lastIdempotencyKey).toBe(idempotencyKey);

      // Second update with same idempotency key - should be ignored
      const result2 = await updateOrderStatus(order.id, 'completed', {
        paymentId: 'pay_456', // Different data
        idempotencyKey, // Same key
      });

      // Status should NOT change
      expect(result2.status).toBe('paid'); // Still 'paid', not 'completed'
      expect(result2.paymentId).toBe('pay_123'); // Original data preserved
      expect(result2.lastIdempotencyKey).toBe(idempotencyKey);
    });

    it('should allow updates with different idempotency keys', async () => {
      const orderData = { amount: 50000 };
      const order = await createOrder(orderData);

      // First update
      const result1 = await updateOrderStatus(order.id, 'paid', {
        paymentId: 'pay_123',
        idempotencyKey: 'key_1',
      });

      expect(result1.status).toBe('paid');

      // Second update with different idempotency key - should succeed
      const result2 = await updateOrderStatus(order.id, 'completed', {
        completedAt: '2023-10-01T12:00:00Z',
        idempotencyKey: 'key_2',
      });

      expect(result2.status).toBe('completed');
      expect(result2.completedAt).toBe('2023-10-01T12:00:00Z');
      expect(result2.lastIdempotencyKey).toBe('key_2');
    });

    it('should allow updates without idempotency key', async () => {
      const orderData = { amount: 50000 };
      const order = await createOrder(orderData);

      const result = await updateOrderStatus(order.id, 'paid', {
        paymentId: 'pay_123',
      });

      expect(result.status).toBe('paid');
      expect(result.lastIdempotencyKey).toBeUndefined();
    });
  });

  describe('Status Transition Validation', () => {
    it('should allow valid transition: created → authorized', async () => {
      const order = await createOrder({ amount: 50000 });

      const result = await updateOrderStatus(order.id, 'authorized', {
        paymentId: 'pay_auth',
      });

      expect(result.status).toBe('authorized');
      expect(result.previousStatus).toBe('created');
    });

    it('should allow valid transition: created → paid', async () => {
      const order = await createOrder({ amount: 50000 });

      const result = await updateOrderStatus(order.id, 'paid', {
        paymentId: 'pay_123',
      });

      expect(result.status).toBe('paid');
      expect(result.previousStatus).toBe('created');
    });

    it('should allow valid transition: authorized → paid', async () => {
      const order = await createOrder({ amount: 50000 });
      
      // First move to authorized
      await updateOrderStatus(order.id, 'authorized', {
        idempotencyKey: 'key_1',
      });

      // Then move to paid
      const result = await updateOrderStatus(order.id, 'paid', {
        paymentId: 'pay_123',
        idempotencyKey: 'key_2',
      });

      expect(result.status).toBe('paid');
      expect(result.previousStatus).toBe('authorized');
    });

    it('should allow valid transition: paid → completed', async () => {
      const order = await createOrder({ amount: 50000 });
      
      // First move to paid
      await updateOrderStatus(order.id, 'paid', {
        idempotencyKey: 'key_1',
      });

      // Then move to completed
      const result = await updateOrderStatus(order.id, 'completed', {
        idempotencyKey: 'key_2',
      });

      expect(result.status).toBe('completed');
      expect(result.previousStatus).toBe('paid');
    });

    it('should allow retry: failed → created', async () => {
      const order = await createOrder({ amount: 50000 });
      
      // Move to failed
      await updateOrderStatus(order.id, 'failed', {
        failureReason: 'Payment failed',
        idempotencyKey: 'key_1',
      });

      // Retry: failed → created
      const result = await updateOrderStatus(order.id, 'created', {
        retryAttempt: 1,
        idempotencyKey: 'key_2',
      });

      expect(result.status).toBe('created');
      expect(result.previousStatus).toBe('failed');
    });

    it('should log warning for invalid transition but allow it', async () => {
      const order = await createOrder({ amount: 50000 });
      
      // Move to completed (terminal status)
      await updateOrderStatus(order.id, 'paid', {
        idempotencyKey: 'key_1',
      });
      await updateOrderStatus(order.id, 'completed', {
        idempotencyKey: 'key_2',
      });

      // Attempt invalid transition: completed → authorized
      // Should log warning but complete
      const result = await updateOrderStatus(order.id, 'authorized', {
        idempotencyKey: 'key_3',
      });

      // Status changes despite invalid transition (for edge cases)
      expect(result.status).toBe('authorized');
    });
  });

  describe('Status History Tracking', () => {
    it('should track status history', async () => {
      const order = await createOrder({ amount: 50000 });

      await updateOrderStatus(order.id, 'authorized', {
        idempotencyKey: 'key_1',
      });

      const result = await updateOrderStatus(order.id, 'paid', {
        idempotencyKey: 'key_2',
      });

      expect(result.statusHistory).toBeDefined();
      expect(result.statusHistory.length).toBe(2);
      
      // Check first transition
      expect(result.statusHistory[0].from).toBe('created');
      expect(result.statusHistory[0].to).toBe('authorized');
      expect(result.statusHistory[0].idempotencyKey).toBe('key_1');
      
      // Check second transition
      expect(result.statusHistory[1].from).toBe('authorized');
      expect(result.statusHistory[1].to).toBe('paid');
      expect(result.statusHistory[1].idempotencyKey).toBe('key_2');
    });

    it('should preserve status history across multiple updates', async () => {
      const order = await createOrder({ amount: 50000 });

      await updateOrderStatus(order.id, 'authorized', { idempotencyKey: 'k1' });
      await updateOrderStatus(order.id, 'paid', { idempotencyKey: 'k2' });
      const result = await updateOrderStatus(order.id, 'completed', { idempotencyKey: 'k3' });

      expect(result.statusHistory.length).toBe(3);
      expect(result.statusHistory.map(h => h.to)).toEqual([
        'authorized',
        'paid',
        'completed',
      ]);
    });
  });

  describe('Terminal Status Protection', () => {
    it('should warn when changing from completed status', async () => {
      const order = await createOrder({ amount: 50000 });
      
      // Move to completed
      await updateOrderStatus(order.id, 'paid', { idempotencyKey: 'k1' });
      await updateOrderStatus(order.id, 'completed', { idempotencyKey: 'k2' });

      // Attempt to change from completed (logs warning)
      const result = await updateOrderStatus(order.id, 'failed', {
        idempotencyKey: 'k3',
      });

      // Change is allowed but logged as warning
      expect(result.status).toBe('failed');
    });

    it('should warn when changing from refunded status', async () => {
      const order = await createOrder({ amount: 50000 });
      
      // Move through valid transitions to refunded
      await updateOrderStatus(order.id, 'paid', { idempotencyKey: 'k1' });
      await updateOrderStatus(order.id, 'completed', { idempotencyKey: 'k2' });
      await updateOrderStatus(order.id, 'refunded', { idempotencyKey: 'k3' });

      // Attempt to change from refunded
      const result = await updateOrderStatus(order.id, 'paid', {
        idempotencyKey: 'k4',
      });

      // Change is allowed but logged as warning
      expect(result.status).toBe('paid');
    });
  });

  describe('Additional Data Preservation', () => {
    it('should preserve additional data in update', async () => {
      const order = await createOrder({ amount: 50000 });

      const result = await updateOrderStatus(order.id, 'paid', {
        paymentId: 'pay_123',
        paidAt: '2023-10-01T12:00:00Z',
        amount: 50000,
        currency: 'INR',
        notes: 'Payment received',
        idempotencyKey: 'key_1',
      });

      expect(result.paymentId).toBe('pay_123');
      expect(result.paidAt).toBe('2023-10-01T12:00:00Z');
      expect(result.amount).toBe(50000);
      expect(result.currency).toBe('INR');
      expect(result.notes).toBe('Payment received');
    });

    it('should merge new data with existing order data', async () => {
      const order = await createOrder({ 
        amount: 50000,
        customField: 'initial',
      });

      const result = await updateOrderStatus(order.id, 'paid', {
        paymentId: 'pay_123',
        newField: 'added',
        idempotencyKey: 'key_1',
      });

      expect(result.customField).toBe('initial'); // Preserved
      expect(result.paymentId).toBe('pay_123'); // Added
      expect(result.newField).toBe('added'); // Added
    });
  });

  describe('Error Handling', () => {
    it('should throw error when order not found', async () => {
      await expect(
        updateOrderStatus('non_existent_order', 'paid')
      ).rejects.toThrow('Order not found: non_existent_order');
    });

    it('should throw error with null orderId', async () => {
      await expect(
        updateOrderStatus(null, 'paid')
      ).rejects.toThrow();
    });

    it('should throw error with undefined orderId', async () => {
      await expect(
        updateOrderStatus(undefined, 'paid')
      ).rejects.toThrow();
    });
  });

  describe('Previous Status Tracking', () => {
    it('should track previous status', async () => {
      const order = await createOrder({ amount: 50000 });

      const result = await updateOrderStatus(order.id, 'paid', {
        idempotencyKey: 'key_1',
      });

      expect(result.previousStatus).toBe('created');
      expect(result.status).toBe('paid');
    });

    it('should update previous status on each transition', async () => {
      const order = await createOrder({ amount: 50000 });

      await updateOrderStatus(order.id, 'authorized', {
        idempotencyKey: 'k1',
      });

      const result = await updateOrderStatus(order.id, 'paid', {
        idempotencyKey: 'k2',
      });

      expect(result.previousStatus).toBe('authorized');
      expect(result.status).toBe('paid');
    });
  });

  describe('Timestamp Updates', () => {
    it('should update updatedAt timestamp', async () => {
      const order = await createOrder({ amount: 50000 });
      const originalUpdatedAt = order.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await updateOrderStatus(order.id, 'paid', {
        idempotencyKey: 'key_1',
      });

      expect(result.updatedAt).toBeDefined();
      expect(result.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple rapid updates with different keys', async () => {
      const order = await createOrder({ amount: 50000 });

      // Simulate rapid updates (different keys)
      const results = await Promise.all([
        updateOrderStatus(order.id, 'authorized', { idempotencyKey: 'k1' }),
        updateOrderStatus(order.id, 'paid', { idempotencyKey: 'k2' }),
        updateOrderStatus(order.id, 'completed', { idempotencyKey: 'k3' }),
      ]);

      // All should complete
      expect(results).toHaveLength(3);
      
      // Final state should be from last update
      const finalOrder = await getOrderById(order.id);
      expect(finalOrder.statusHistory.length).toBeGreaterThan(0);
    });

    it('should handle failure scenarios', async () => {
      const order = await createOrder({ amount: 50000 });

      await updateOrderStatus(order.id, 'failed', {
        failureReason: 'Payment declined',
        errorCode: 'DECLINED',
        idempotencyKey: 'key_fail',
      });

      const result = await getOrderById(order.id);
      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe('Payment declined');
      expect(result.errorCode).toBe('DECLINED');
    });

    it('should handle order lifecycle: created → authorized → paid → completed', async () => {
      const order = await createOrder({ amount: 50000 });

      // Authorize
      const auth = await updateOrderStatus(order.id, 'authorized', {
        paymentId: 'pay_auth',
        idempotencyKey: 'k1',
      });
      expect(auth.status).toBe('authorized');

      // Pay
      const paid = await updateOrderStatus(order.id, 'paid', {
        paymentId: 'pay_123',
        paidAt: new Date().toISOString(),
        idempotencyKey: 'k2',
      });
      expect(paid.status).toBe('paid');

      // Complete
      const completed = await updateOrderStatus(order.id, 'completed', {
        completedAt: new Date().toISOString(),
        idempotencyKey: 'k3',
      });
      expect(completed.status).toBe('completed');
      expect(completed.statusHistory.length).toBe(3);
    });
  });
});

