# Quick Start Guide

Get up and running with Pegasus Payment Service in under 5 minutes!

## 🚀 Quick Setup

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp env.example .env

# 3. Start the service
npm start
```

The service will be available at `http://localhost:3000`

## 🧪 Quick Test

```bash
# Run all tests
npm test
```

## 📝 Quick API Test

### 1. Check Health
```bash
curl http://localhost:3000/api/health
```

### 2. Create an Order
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50000,
    "currency": "INR",
    "receipt": "receipt_123",
    "customer_email": "test@example.com"
  }'
```

### 3. Get Order by ID
```bash
# Replace ORDER_ID with the ID from step 2
curl http://localhost:3000/api/orders/ORDER_ID
```

### 4. Update Order Status
```bash
# Replace ORDER_ID with the ID from step 2
curl -X PATCH http://localhost:3000/api/orders/ORDER_ID/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "paid",
    "paymentId": "pay_mock123"
  }'
```

## 📚 Key Files to Know

- `src/server.js` - Entry point
- `src/app.js` - Express app configuration
- `src/routes/index.js` - All API routes
- `src/services/` - Business logic (stubbed functions here)
- `src/mocks/` - Mock data for Shopify & Razorpay
- `tests/` - All unit tests

## 🔧 Available Functions

All these functions are implemented and tested:

```javascript
// Order Service
createOrder(orderData)
getOrderById(orderId)
updateOrderStatus(orderId, status, additionalData)

// Payment Service
verifyRazorpaySignature(webhookBody, signature, secret)
persistPayment(paymentData)
getPaymentById(paymentId)

// Webhook Service
handleWebhook(webhookPayload, signature, rawBody)
```

## 🐛 Development Commands

```bash
# Start with hot reload
npm run dev

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

## 📊 Test Coverage

Run `npm test` to see coverage for:
- ✅ All service functions
- ✅ All controllers
- ✅ API endpoints
- ✅ Webhook handling
- ✅ Signature verification
- ✅ Error scenarios

## 🎯 Next Steps

1. Review the code in `src/services/` - all stubbed functions are here
2. Check out `src/mocks/` for Shopify and Razorpay mock data
3. Run the tests to understand the expected behavior
4. Modify `.env` for your specific configuration
5. Replace in-memory stores with actual database when ready

## 💡 Tips

- All logs are structured JSON (see `logs/` directory)
- Mock data is used for all third-party APIs
- Environment config is in `src/config/index.js`
- Health endpoint is great for container orchestration

Happy coding! 🎉

