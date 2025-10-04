/**
 * Mock data for Razorpay API responses
 */

const mockRazorpayOrder = {
  id: 'order_Mock123456789',
  entity: 'order',
  amount: 50000, // in paise (500 INR)
  amount_paid: 0,
  amount_due: 50000,
  currency: 'INR',
  receipt: 'receipt_order_123',
  status: 'created',
  attempts: 0,
  notes: {
    shopify_order_id: '4567890123',
    customer_email: 'customer@example.com',
  },
  created_at: Math.floor(Date.now() / 1000),
};

const mockRazorpayPayment = {
  id: 'pay_Mock987654321',
  entity: 'payment',
  amount: 50000,
  currency: 'INR',
  status: 'captured',
  order_id: 'order_Mock123456789',
  invoice_id: null,
  international: false,
  method: 'card',
  amount_refunded: 0,
  refund_status: null,
  captured: true,
  description: 'Payment for order #4567890123',
  card_id: 'card_MockCard123',
  bank: null,
  wallet: null,
  vpa: null,
  email: 'customer@example.com',
  contact: '+919876543210',
  notes: {
    shopify_order_id: '4567890123',
  },
  fee: 1180,
  tax: 180,
  error_code: null,
  error_description: null,
  created_at: Math.floor(Date.now() / 1000),
};

const mockRazorpayWebhookPayload = {
  entity: 'event',
  account_id: 'acc_MockAccount123',
  event: 'payment.captured',
  contains: ['payment'],
  payload: {
    payment: {
      entity: mockRazorpayPayment,
    },
  },
  created_at: Math.floor(Date.now() / 1000),
};

const mockRazorpayWebhookSignature = 'mock_signature_abc123def456';

module.exports = {
  mockRazorpayOrder,
  mockRazorpayPayment,
  mockRazorpayWebhookPayload,
  mockRazorpayWebhookSignature,
};

