const webhookService = require('../../../src/services/webhook/webhookService');
const paymentService = require('../../../src/services/payment/paymentService');
const { SignatureVerificationError } = require('../../../src/utils/errors');

jest.mock('../../../src/services/payment/paymentService');

describe('Webhook Service', () => {
  it('should handle webhook', async () => {
    const webhookData = {
      body: { event: 'payment.captured' },
      headers: { 'x-razorpay-signature': 'signature' },
    };
    const result = await webhookService.handleWebhook(webhookData);
    expect(result).toEqual({ received: true, idempotencyKey: undefined });
  });

  it('should extract idempotency key from header', async () => {
    const webhookData = {
      body: { event: 'payment.captured' },
      headers: { 'idempotency-key': 'idempotency123', 'x-razorpay-signature': 'signature' },
    };
    const result = await webhookService.handleWebhook(webhookData);
    expect(result).toEqual({ received: true, idempotencyKey: 'idempotency123' });
  });

  it('should call verifyRazorpaySignature', async () => {
    const webhookData = {
      body: { event: 'payment.captured' },
      headers: { 'x-razorpay-signature': 'signature123' },
    };
    await webhookService.handleWebhook(webhookData);
    expect(paymentService.verifyRazorpaySignature).toHaveBeenCalledWith(
      webhookData.body,
      'signature123'
    );
  });

  it('should throw SignatureVerificationError on mismatch', async () => {
    paymentService.verifyRazorpaySignature.mockImplementation(() => {
      throw new SignatureVerificationError('Invalid signature');
    });
    const webhookData = {
      body: { event: 'payment.captured' },
      headers: { 'x-razorpay-signature': 'invalidsignature' },
    };
    await expect(webhookService.handleWebhook(webhookData)).rejects.toThrow(
      SignatureVerificationError
    );
  });
});
