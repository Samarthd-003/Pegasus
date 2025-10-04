const webhookService = require('../../../src/services/webhook/webhookService');

describe('Webhook Service', () => {
  it('should handle webhook', async () => {
    const webhookData = { event: 'payment.captured' };
    const result = await webhookService.handleWebhook(webhookData);
    expect(result).toEqual({ received: true });
  });
});
