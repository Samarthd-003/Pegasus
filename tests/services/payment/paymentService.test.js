const paymentService = require('../../../src/services/payment/paymentService');

describe('Payment Service', () => {
  it('should verify razorpay signature', () => {
    const result = paymentService.verifyRazorpaySignature('order123', 'payment123', 'signature');
    expect(result).toBe(true);
  });

  it('should persist payment', async () => {
    const paymentDetails = { orderId: 'order123', paymentId: 'payment123', amount: 100 };
    const payment = await paymentService.persistPayment(paymentDetails);
    expect(payment.status).toBe('captured');
  });
});
