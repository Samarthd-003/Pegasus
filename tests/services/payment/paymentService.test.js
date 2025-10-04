const crypto = require('crypto');
const paymentService = require('../../../src/services/payment/paymentService');
const { SignatureVerificationError } = require('../../../src/utils/errors');
const config = require('../../../src/config');

describe('Payment Service', () => {
  const originalSecret = config.razorpayWebhookSecret;

  beforeEach(() => {
    config.razorpayWebhookSecret = 'test-secret';
  });

  afterEach(() => {
    config.razorpayWebhookSecret = originalSecret;
  });

  it('should verify razorpay signature', () => {
    const payload = { event: 'payment.captured' };
    const hmac = crypto.createHmac('sha256', 'test-secret');
    hmac.update(JSON.stringify(payload));
    const signature = hmac.digest('hex');

    const result = paymentService.verifyRazorpaySignature(payload, signature);
    expect(result).toBe(true);
  });

  it('should throw SignatureVerificationError on invalid signature', () => {
    const payload = { event: 'payment.captured' };
    const signature = 'invalid-signature';
    expect(() => paymentService.verifyRazorpaySignature(payload, signature)).toThrow(
      SignatureVerificationError
    );
  });

  it('should persist payment', async () => {
    const paymentDetails = { orderId: 'order123', paymentId: 'payment123', amount: 100 };
    const payment = await paymentService.persistPayment(paymentDetails);
    expect(payment.status).toBe('captured');
  });
});
