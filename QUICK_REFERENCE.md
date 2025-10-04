# Quick Reference Guide

## ⚡ Quick Start

### Environment Setup
```bash
# Copy and configure
cp env.example .env

# Required variables
SHOPIFY_STORE_URL=https://your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
RAZORPAY_KEY_ID=rzp_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=webhook_secret_xxxxx
NODE_ENV=development
LOG_LEVEL=info
```

### Start Server
```bash
npm install
npm start  # Production
npm run dev  # Development with nodemon
```

## 📋 API Quick Reference

### Create Order
```bash
POST /orders
Content-Type: application/json

{
  "email": "customer@example.com",
  "amount": 50000,
  "currency": "INR",
  "line_items": [
    {
      "title": "Product Name",
      "quantity": 1,
      "price": 500.00
    }
  ],
  "billing_address": {
    "first_name": "John",
    "last_name": "Doe",
    "address1": "123 Main St",
    "city": "Mumbai",
    "zip": "400001",
    "country": "India"
  }
}

Response: {
  "id": "order_xxx",
  "shopifyOrderId": 123456,
  "status": "created",
  ...
}
```

### Get Order
```bash
GET /orders/:orderId

Response: {
  "id": "order_xxx",
  "status": "paid",
  "shopifyFinancialStatus": "paid",
  ...
}
```

### Webhook Endpoint
```bash
POST /webhooks/razorpay
x-razorpay-signature: <signature>

# Automatically processes:
# - payment.authorized
# - payment.captured
# - payment.failed
# - order.paid
```

## 🔧 Service Functions

### Order Service
```javascript
const { createOrder, getOrderById, updateOrderStatus } = require('./services/orderService');

// Create order
const order = await createOrder({
  email: 'customer@example.com',
  amount: 50000,
  line_items: [...]
});

// Get order (cached)
const order = await getOrderById('order_xxx');

// Get order with Shopify sync
const order = await getOrderById('order_xxx', { syncWithShopify: true });

// Update order status
const order = await updateOrderStatus('order_xxx', 'paid', {
  paymentId: 'pay_xxx',
  amount: 50000,
  idempotencyKey: 'evt_xxx'
});
```

### Shopify Service
```javascript
const { createShopifyOrder, getShopifyOrderById, confirmShopifyOrderPayment } = require('./services/shopifyService');

// Create Shopify order
const shopifyOrder = await createShopifyOrder({
  email: 'customer@example.com',
  line_items: [...],
  financial_status: 'pending'
});

// Get Shopify order
const shopifyOrder = await getShopifyOrderById(123456);

// Confirm payment
const result = await confirmShopifyOrderPayment(123456, {
  gateway: 'razorpay',
  amount: 500.00,
  authorization: 'pay_xxx'
});
```

### Retry Utility
```javascript
const { retryWithBackoff } = require('./utils/retry');

// Retry any async operation
const result = await retryWithBackoff(
  () => someAsyncOperation(),
  {
    maxRetries: 3,
    timeout: 30000,
    operationName: 'My Operation',
    context: { id: '123' }
  }
);
```

## 📊 Order Object Structure

```javascript
{
  // Internal fields
  id: "order_xxx",
  email: "customer@example.com",
  amount: 50000,
  currency: "INR",
  status: "paid",  // created | authorized | paid | failed | completed | refunded
  
  // Shopify fields
  shopifyOrderId: 123456,
  shopifyOrderNumber: 1001,
  shopifyFinancialStatus: "paid",
  shopifyFulfillmentStatus: null,
  shopifySyncedAt: "2025-10-04T10:30:00.000Z",
  
  // Payment fields
  razorpayOrderId: "order_xxx",
  paymentId: "pay_xxx",
  paidAt: "2025-10-04T10:30:00.000Z",
  
  // History tracking
  statusHistory: [
    {
      from: "created",
      to: "paid",
      timestamp: "2025-10-04T10:30:00.000Z",
      idempotencyKey: "evt_xxx",
      reason: null
    }
  ],
  
  // Failure tracking
  failureHistory: [
    {
      timestamp: "2025-10-04T10:30:00.000Z",
      previousStatus: "authorized",
      failureReason: "Card declined",
      errorCode: "BAD_REQUEST_ERROR",
      errorDescription: "Insufficient funds",
      paymentId: "pay_xxx",
      idempotencyKey: "evt_xxx",
      metadata: { ... }
    }
  ],
  
  // Timestamps
  createdAt: "2025-10-04T10:00:00.000Z",
  updatedAt: "2025-10-04T10:30:00.000Z",
  lastSyncedAt: "2025-10-04T10:30:00.000Z"
}
```

## 🔍 Debugging

### Enable Debug Logging
```bash
LOG_LEVEL=debug npm start
```

### Check Order Status
```javascript
const order = await getOrderById('order_xxx');
console.log('Status:', order.status);
console.log('Shopify status:', order.shopifyFinancialStatus);
console.log('Failures:', order.failureHistory.length);
console.log('Status changes:', order.statusHistory.length);
```

### Check Failure History
```javascript
const order = await getOrderById('order_xxx');
if (order.failureHistory && order.failureHistory.length > 0) {
  order.failureHistory.forEach((failure, i) => {
    console.log(`Failure ${i + 1}:`, {
      reason: failure.failureReason,
      code: failure.errorCode,
      time: failure.timestamp,
      attempt: failure.metadata.attemptNumber
    });
  });
}
```

### Check Logs
```bash
# View logs
tail -f logs/combined.log

# View errors only
tail -f logs/error.log

# Search for order
grep "order_xxx" logs/combined.log
```

## 🚨 Common Issues

### Order Not Created in Shopify
**Symptom**: Order exists internally but not in Shopify

**Check**:
```javascript
const order = await getOrderById('order_xxx');
console.log('Shopify order ID:', order.shopifyOrderId);
console.log('Shopify sync error:', order.shopifySyncError);
```

**Fix**: Shopify credentials in `.env`, or manually create order in Shopify

### Payment Not Confirmed
**Symptom**: Order shows 'paid' but Shopify shows 'pending'

**Check**:
```javascript
const order = await getOrderById('order_xxx');
console.log('Shopify synced at:', order.shopifySyncedAt);
console.log('Sync error:', order.shopifySyncError);
```

**Fix**: Check logs for "Failed to confirm payment in Shopify", manually confirm in Shopify admin

### Webhook Signature Failed
**Symptom**: Webhooks return 401

**Check**: `RAZORPAY_WEBHOOK_SECRET` matches Razorpay dashboard

**Fix**: 
```bash
# Update .env
RAZORPAY_WEBHOOK_SECRET=your_actual_secret

# Restart server
npm restart
```

### Multiple Failures
**Symptom**: `failureHistory` has multiple entries

**Expected**: This is normal for payment retries

**Check**:
```javascript
const order = await getOrderById('order_xxx');
console.log('Failure count:', order.failureHistory.length);
order.failureHistory.forEach(f => {
  console.log(`Attempt ${f.metadata.attemptNumber}: ${f.failureReason}`);
});
```

## 🎯 Key Features

### ✅ Implemented
- Shopify order creation with retry
- Order retrieval with optional sync
- Status updates with Shopify confirmation
- Webhook signature verification (line 42 of webhookService.js)
- Failure information preservation
- Idempotency protection
- Comprehensive logging
- Timeout handling
- Exponential backoff retries
- Graceful fallbacks

### 🎯 Status Transitions
```
created → authorized → paid → completed → refunded
   ↓           ↓        ↑
   └─────> failed ──────┘ (retry allowed)
```

### 🔁 Retry Configuration
```javascript
{
  maxRetries: 3,        // Max retry attempts
  initialDelay: 1000,   // 1s initial delay
  maxDelay: 10000,      // 10s max delay
  timeout: 30000,       // 30s per attempt
  backoffMultiplier: 2  // Exponential growth
}
```

### 📝 Log Emojis
- 🛒 Order creation
- 📋 Order retrieval
- 🔄 Status update
- 💳 Payment confirmation
- 💥 Payment failure
- ⏳ Retry wait
- ✅ Success
- ❌ Error
- ⚠️ Warning

## 📚 Documentation

- **SHOPIFY_INTEGRATION.md** - Complete technical documentation
- **IMPLEMENTATION_COMPLETE.md** - Implementation summary
- **ORDER_FLOW_DIAGRAM.md** - Visual flow diagrams
- **QUICK_REFERENCE.md** - This file
- **README.md** - Project overview

## 🔗 Related Files

### Core Services
- `src/services/orderService.js` - Order management with Shopify integration
- `src/services/shopifyService.js` - Shopify API integration
- `src/services/webhookService.js` - Webhook processing with signature verification
- `src/services/paymentService.js` - Payment persistence and signature verification

### Utilities
- `src/utils/retry.js` - Retry logic with exponential backoff
- `src/utils/logger.js` - Structured logging
- `src/utils/idempotency.js` - Idempotency key management
- `src/utils/errors.js` - Custom error classes

### Controllers
- `src/controllers/orderController.js` - Order API endpoints
- `src/controllers/webhookController.js` - Webhook endpoint

### Configuration
- `src/config/index.js` - Configuration management
- `.env` - Environment variables

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- orderService.test.js

# Watch mode
npm run test:watch
```

## 📞 Support Resources

1. Check logs: `tail -f logs/combined.log`
2. Enable debug: `LOG_LEVEL=debug`
3. Review failure history in order object
4. Check status history for transitions
5. Verify Shopify admin panel
6. Check Razorpay webhook logs

## 🚀 Next Steps

1. ✅ Service is ready for production
2. Set environment variables
3. Test webhook signature verification
4. Monitor logs for issues
5. Set up database (replace in-memory store)
6. Configure monitoring/alerts
7. Set up log aggregation

