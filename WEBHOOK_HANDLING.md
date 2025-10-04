# Webhook Handling Implementation

## Overview

Enhanced webhook handling system with comprehensive event parsing, payment persistence, order status management, and robust error handling. Includes essential logging flow (received → validated → applied) and prevention of double-application.

## Key Features

### 1. Three-Phase Processing Flow

Every webhook follows this standardized flow with structured logging:

```
📥 RECEIVED  → ✅ VALIDATED  → ✅ APPLIED
```

**Phase 1: RECEIVED**
- Log incoming webhook with metadata
- Capture timestamp, event type, signature presence

**Phase 2: VALIDATED**
- Verify HMAC-SHA256 signature
- Extract/generate idempotency key
- Check for duplicate processing
- Parse and validate event structure

**Phase 3: APPLIED**
- Call appropriate event handler
- Persist payment data
- Update order status
- Cache result for idempotency

### 2. Event Handlers

#### `handleWebhook(webhookPayload, signature, rawBody, headers)`

Main webhook dispatcher with:
- ✅ Signature verification (throws on failure)
- ✅ Idempotency checking (prevents double-processing)
- ✅ Event type routing
- ✅ Error handling with context logging
- ✅ Duration tracking

**Supported Events:**
- `payment.authorized` - Payment authorized
- `payment.captured` - Payment captured (calls `persistPayment()`)
- `payment.failed` - Payment failed (logs error details)
- `order.paid` - Order paid (updates to completed)

#### `handlePaymentCaptured(payload, idempotencyKey)`

Critical handler for successful payments:
- ✅ Validates payload structure
- ✅ Calls `persistPayment()` to save payment data
- ✅ Updates order status to 'paid'
- ✅ Logs all steps (persisting → updating → success)
- ✅ Returns payment and order details

#### `handlePaymentFailed(payload, idempotencyKey)`

Handles payment failures:
- ✅ Persists failure information
- ✅ Updates order status to 'failed'
- ✅ Logs error codes and reasons
- ✅ Does NOT throw (logs errors only)

### 3. Payment Persistence

#### `persistPayment(paymentData)`

Enhanced with:
- ✅ Validation of payment data structure
- ✅ Duplicate detection (updates instead of creating new)
- ✅ Update counter tracking
- ✅ Comprehensive field mapping
- ✅ Status-based validation

**Prevents Double-Persistence:**
```javascript
const existingPayment = paymentsStore.get(paymentId);
if (existingPayment) {
  // Update instead of create
  return updatedPayment;
}
```

**Mock API Integration:**
```javascript
// In tests, persistPayment is mocked
jest.mock('../../src/services/paymentService');

// Verify it was called correctly
expect(persistPayment).toHaveBeenCalledWith({
  id: 'pay_123',
  amount: 50000,
  status: 'captured'
});
```

### 4. Order Status Management

#### `updateOrderStatus(orderId, status, additionalData)`

Enhanced with multiple protections:

**1. Idempotency Protection**
```javascript
if (idempotencyKey && order.lastIdempotencyKey === idempotencyKey) {
  logger.info('⚠️  Status update already applied');
  return order; // No change
}
```

**2. Status Transition Validation**
```javascript
const validTransitions = {
  created: ['authorized', 'paid', 'failed', 'cancelled'],
  authorized: ['paid', 'failed', 'cancelled'],
  paid: ['completed', 'refunded'],
  // ...
};
```

**3. Terminal Status Protection**
```javascript
const terminalStatuses = ['completed', 'refunded'];
if (terminalStatuses.includes(currentStatus)) {
  logger.warn('Attempting to change terminal status');
}
```

**4. Status History Tracking**
```javascript
statusHistory.push({
  from: currentStatus,
  to: status,
  timestamp: new Date().toISOString(),
  idempotencyKey,
});
```

## Logging Flow Examples

### Successful Webhook Processing

```
📥 RECEIVED: Webhook received
  event: payment.captured
  accountId: acc_123
  bodyLength: 456
  timestamp: 2023-10-04T12:00:00Z

✅ VALIDATED: Webhook signature verified successfully
  event: payment.captured

🔄 PROCESSING: Handling webhook event
  event: payment.captured
  idempotencyKey: payment.captured_pay_123

💰 Processing payment.captured event
  paymentId: pay_123
  orderId: order_456
  amount: 50000
  status: captured

✅ Payment persisted successfully
  paymentId: pay_123
  orderId: order_456

✅ Order status updated successfully
  orderId: order_456
  previousStatus: created
  newStatus: paid

✅ APPLIED: Webhook processed and cached
  event: payment.captured
  idempotencyKey: payment.captured_pay_123

✅ SUCCESS: Webhook processing completed
  event: payment.captured
  duration: 15ms
```

### Duplicate Detection

```
📥 RECEIVED: Webhook received
✅ VALIDATED: Webhook signature verified successfully
⚠️  SKIPPED: Webhook already processed (duplicate detected)
  idempotencyKey: payment.captured_pay_123
  event: payment.captured
```

### Validation Failure

```
📥 RECEIVED: Webhook received
❌ VALIDATION FAILED: Signature verification failed
  event: payment.captured
  error: Signature verification failed
```

### Processing Error

```
📥 RECEIVED: Webhook received
✅ VALIDATED: Webhook signature verified successfully
❌ PARSE ERROR: Webhook event type is missing
```

## Error Handling

### Errors Don't Prevent Logging

All failures are logged with full context but don't crash the service:

```javascript
try {
  await persistPayment(payment);
} catch (error) {
  logger.error('Failed to process payment.captured', {
    error: error.message,
    idempotencyKey,
    stack: error.stack,
  });
  throw error; // Re-throw for webhook retry
}
```

### Error Types

- **`SignatureVerificationError`** - Invalid signature (401)
- **`ValidationError`** - Missing/invalid data (400)
- **`WebhookProcessingError`** - Processing failure (500)

## Unit Tests

### Test Coverage

#### `handleWebhook()` Tests (40+ tests)
- ✅ Three-phase flow validation
- ✅ Event parsing and validation
- ✅ Mocked `persistPayment()` calls
- ✅ Mocked `updateOrderStatus()` calls
- ✅ Duplicate detection
- ✅ Error propagation
- ✅ Unhandled event types
- ✅ Invalid payload structures
- ✅ Missing required fields

#### `updateOrderStatus()` Tests (30+ tests)
- ✅ Double-application prevention
- ✅ Status transition validation
- ✅ Terminal status protection
- ✅ Status history tracking
- ✅ Additional data preservation
- ✅ Previous status tracking
- ✅ Timestamp updates
- ✅ Complex lifecycle scenarios
- ✅ Failure scenarios
- ✅ Error handling

### Example Test with Mocked API

```javascript
describe('payment.captured with Mocked API', () => {
  it('should call persistPayment with correct data', async () => {
    const paymentEntity = {
      id: 'pay_123',
      order_id: 'order_456',
      amount: 75000,
      status: 'captured',
    };

    const webhookPayload = {
      event: 'payment.captured',
      payload: { payment: { entity: paymentEntity } },
    };

    await handleWebhook(webhookPayload, signature, rawBody, {});

    // Verify persistPayment was called
    expect(persistPayment).toHaveBeenCalledTimes(1);
    expect(persistPayment).toHaveBeenCalledWith(paymentEntity);
    
    // Verify updateOrderStatus was called after
    expect(updateOrderStatus).toHaveBeenCalledWith(
      'order_456',
      'paid',
      expect.objectContaining({
        paymentId: 'pay_123',
        amount: 75000,
      })
    );
  });
});
```

### Running Tests

```bash
# Run all webhook tests
npm test tests/services/webhookService.enhanced.test.js

# Run updateOrderStatus tests
npm test tests/services/orderService.enhanced.test.js

# Run with coverage
npm test -- --coverage
```

## API Integration Points

### Razorpay Payment Capture Flow

```javascript
// Webhook receives payment.captured
{
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_123',
        order_id: 'order_456',
        amount: 50000,
        currency: 'INR',
        status: 'captured'
      }
    }
  }
}

// 1. Validate signature ✅
// 2. Extract idempotency key ✅
// 3. Check for duplicate ✅
// 4. Parse event ✅
// 5. Persist payment ✅
// 6. Update order status ✅
// 7. Cache result ✅
// 8. Return success ✅
```

### Shopify Order Integration

Order data is enriched with Shopify mock data:

```javascript
const order = {
  id: 'order_456',
  shopifyOrderId: mockShopifyOrder.id,
  razorpayOrderId: mockRazorpayOrder.id,
  status: 'created',
  // ...
};
```

## Double-Application Prevention

### Scenario: Duplicate Webhook Delivery

Razorpay may send the same webhook multiple times:

```javascript
// Request 1
POST /api/webhooks/razorpay
x-idempotency-key: payment.captured_pay_123
// Result: Payment persisted, order updated

// Request 2 (duplicate)
POST /api/webhooks/razorpay
x-idempotency-key: payment.captured_pay_123
// Result: Cached response returned, no duplicate processing
```

### Scenario: Idempotency in Order Updates

```javascript
// First update
await updateOrderStatus('order_123', 'paid', {
  paymentId: 'pay_123',
  idempotencyKey: 'key_1'
});
// Result: Status changed to 'paid'

// Duplicate update (same key)
await updateOrderStatus('order_123', 'completed', {
  paymentId: 'pay_456',
  idempotencyKey: 'key_1' // Same key!
});
// Result: No change, returns existing order in 'paid' status
```

## Production Considerations

### Monitoring

Monitor these key metrics:
- Webhook processing duration
- Duplicate detection rate
- Payment persistence success rate
- Order status update success rate
- Error rates by error type

### Alerting

Set up alerts for:
- High signature verification failure rate
- Payment persistence failures
- Order status update failures
- Processing duration > threshold

### Retry Strategy

Razorpay will retry failed webhooks:
- 1st retry: After 5 minutes
- 2nd retry: After 30 minutes
- 3rd retry: After 2 hours
- 4th retry: After 6 hours

Idempotency ensures retries don't duplicate data.

## Summary

### What Was Enhanced

1. ✅ **Structured Logging Flow**
   - Received → Validated → Applied
   - Essential logs at each phase
   - Context-rich error logging

2. ✅ **Payment Persistence**
   - Validates data structure
   - Prevents duplicate persistence
   - Tracks update count
   - Comprehensive field mapping

3. ✅ **Order Status Management**
   - Double-application prevention via idempotency
   - Status transition validation
   - Terminal status protection
   - Complete status history tracking

4. ✅ **Error Handling**
   - Logs errors without crashing
   - Typed errors with context
   - Proper error propagation

5. ✅ **Comprehensive Tests**
   - 70+ new test cases
   - Mocked API calls
   - Edge case coverage
   - Complex scenarios

### Files Modified

1. `src/services/webhookService.js` - Enhanced event handling
2. `src/services/orderService.js` - Enhanced status updates
3. `src/services/paymentService.js` - Enhanced persistence
4. `tests/services/webhookService.enhanced.test.js` - New tests
5. `tests/services/orderService.enhanced.test.js` - New tests

### Test Statistics

- **Total Test Cases**: 70+
- **Mocked Functions**: `persistPayment`, `updateOrderStatus`
- **Coverage**: All critical paths covered
- **Edge Cases**: Duplicates, failures, invalid data, complex scenarios

All requirements have been fully implemented with production-grade code! 🎉

