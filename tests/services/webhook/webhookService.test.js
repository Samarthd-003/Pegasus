const webhookService = require('../../../src/services/webhook/webhookService');
const paymentService = require('../../../src/services/payment/paymentService');
const orderService = require('../../../src/services/order/orderService');
const logger = require('../../../src/utils/logger');
const { SignatureVerificationError } = require('../../../src/utils/errors');

jest.mock('../../../src/services/payment/paymentService');
jest.mock('../../../src/services/order/orderService');
jest.mock('../../../src/utils/logger');

describe('Webhook Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockWebhookData = (event, payload, headers = {}) => ({
    body: {
      event,
      payload,
    },
    headers: { 'x-razorpay-signature': 'valid-signature', ...headers },
  });

  it('should process payment.captured event, persist payment, and update order status', async () => {
    const paymentEntity = { id: 'pay_123', order_id: 'order_123', status: 'captured' };
    const data = mockWebhookData('payment.captured', { payment: { entity: paymentEntity } });

    await webhookService.handleWebhook(data);

    expect(paymentService.verifyRazorpaySignature).toHaveBeenCalledWith(data.body, 'valid-signature');
    expect(paymentService.persistPayment).toHaveBeenCalledWith(paymentEntity);
    expect(orderService.updateOrderStatus).toHaveBeenCalledWith('order_123', 'paid');
    expect(logger.info).toHaveBeenCalledWith('Webhook applied: payment captured and order status updated', { orderId: 'order_123' });
  });

  it('should ignore events other than payment.captured', async () => {
    const data = mockWebhookData('order.paid', { order: { entity: { id: 'order_123' } } });

    await webhookService.handleWebhook(data);

    expect(paymentService.verifyRazorpaySignature).toHaveBeenCalled();
    expect(paymentService.persistPayment).not.toHaveBeenCalled();
    expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Ignoring webhook event', { event: 'order.paid' });
  });

  it('should log an error if persistPayment fails', async () => {
    const paymentEntity = { id: 'pay_123', order_id: 'order_123', status: 'captured' };
    const data = mockWebhookData('payment.captured', { payment: { entity: paymentEntity } });
    const error = new Error('DB error');
    paymentService.persistPayment.mockRejectedValue(error);

    await webhookService.handleWebhook(data);

    expect(paymentService.persistPayment).toHaveBeenCalledWith(paymentEntity);
    expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Error processing payment.captured webhook', {
      error: 'DB error',
      orderId: 'order_123',
    });
  });

  it('should log an error if updateOrderStatus fails', async () => {
    const paymentEntity = { id: 'pay_123', order_id: 'order_123', status: 'captured' };
    const data = mockWebhookData('payment.captured', { payment: { entity: paymentEntity } });
    const error = new Error('Update status error');
    paymentService.persistPayment.mockResolvedValue({ status: 'captured' });
    orderService.updateOrderStatus.mockRejectedValue(error);

    await webhookService.handleWebhook(data);

    expect(paymentService.persistPayment).toHaveBeenCalledWith(paymentEntity);
    expect(orderService.updateOrderStatus).toHaveBeenCalledWith('order_123', 'paid');
    expect(logger.error).toHaveBeenCalledWith('Error processing payment.captured webhook', {
      error: 'Update status error',
      orderId: 'order_123',
    });
  });

  it('should extract idempotency key from header', async () => {
    const paymentEntity = { id: 'pay_123', order_id: 'order_123', status: 'captured' };
    const data = mockWebhookData('payment.captured', { payment: { entity: paymentEntity } }, { 'idempotency-key': 'idempotency123' });

    const result = await webhookService.handleWebhook(data);
    expect(result).toHaveProperty('idempotencyKey', 'idempotency123');
  });

  it('should throw SignatureVerificationError on mismatch', async () => {
    const paymentEntity = { id: 'pay_123', order_id: 'order_123', status: 'captured' };
    const data = mockWebhookData('payment.captured', { payment: { entity: paymentEntity } });
    paymentService.verifyRazorpaySignature.mockImplementation(() => {
      throw new SignatureVerificationError('Invalid signature');
    });

    await expect(webhookService.handleWebhook(data)).rejects.toThrow(SignatureVerificationError);
  });
});
