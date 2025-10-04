const paymentService = require('../payment/paymentService');

const handleWebhook = async ({ body, headers = {} }) => {
  const signature = headers['x-razorpay-signature'];
  paymentService.verifyRazorpaySignature(body, signature);

  const idempotencyKey = headers['idempotency-key'];

  // TODO: Implement webhook handling logic
  return { received: true, idempotencyKey };
};

module.exports = {
  handleWebhook,
};
