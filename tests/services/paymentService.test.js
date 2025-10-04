const crypto = require('crypto');
const {
  verifyRazorpaySignature,
  persistPayment,
  getPaymentById,
  clearPayments,
} = require('../../src/services/paymentService');

describe('PaymentService', () => {
  beforeEach(() => {
    clearPayments();
  });

  describe('verifyRazorpaySignature', () => {
    const webhookSecret = 'test_webhook_secret';
    const webhookBody = JSON.stringify({ event: 'payment.captured' });

    it('should verify valid signature', () => {
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(webhookBody)
        .digest('hex');

      const isValid = verifyRazorpaySignature(webhookBody, signature, webhookSecret);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const invalidSignature = 'invalid_signature_123';
      const isValid = verifyRazorpaySignature(
        webhookBody,
        invalidSignature,
        webhookSecret
      );
      expect(isValid).toBe(false);
    });

    it('should return false when signature is not provided', () => {
      const isValid = verifyRazorpaySignature(webhookBody, null, webhookSecret);
      expect(isValid).toBe(false);
    });

    it('should return true when webhook secret is not configured', () => {
      const isValid = verifyRazorpaySignature(webhookBody, 'any_signature', null);
      expect(isValid).toBe(true);
    });
  });

  describe('persistPayment', () => {
    it('should persist payment successfully', async () => {
      const paymentData = {
        id: 'pay_123',
        razorpay_payment_id: 'pay_razorpay_123',
        razorpay_order_id: 'order_123',
        razorpay_signature: 'signature_123',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        method: 'card',
        email: 'test@example.com',
        contact: '+919876543210',
      };

      const payment = await persistPayment(paymentData);

      expect(payment).toBeDefined();
      expect(payment.id).toBe('pay_123');
      expect(payment.razorpayPaymentId).toBe('pay_razorpay_123');
      expect(payment.amount).toBe(50000);
      expect(payment.status).toBe('captured');
      expect(payment.createdAt).toBeDefined();
    });

    it('should throw error when payment data is invalid', async () => {
      await expect(persistPayment(null)).rejects.toThrow(
        'Invalid payment data: payment ID is required'
      );
    });

    it('should throw error when payment ID is missing', async () => {
      const paymentData = {
        amount: 50000,
      };

      await expect(persistPayment(paymentData)).rejects.toThrow(
        'Invalid payment data: payment ID is required'
      );
    });

    it('should use mock data for missing fields', async () => {
      const paymentData = {
        id: 'pay_123',
      };

      const payment = await persistPayment(paymentData);

      expect(payment.id).toBe('pay_123');
      expect(payment.razorpayPaymentId).toBeDefined();
      expect(payment.amount).toBeDefined();
      expect(payment.status).toBe('captured');
    });
  });

  describe('getPaymentById', () => {
    it('should retrieve an existing payment', async () => {
      const paymentData = {
        id: 'pay_123',
        amount: 50000,
      };

      await persistPayment(paymentData);
      const payment = await getPaymentById('pay_123');

      expect(payment).toBeDefined();
      expect(payment.id).toBe('pay_123');
    });

    it('should return null for non-existent payment', async () => {
      const payment = await getPaymentById('non_existent_id');
      expect(payment).toBeNull();
    });
  });
});

