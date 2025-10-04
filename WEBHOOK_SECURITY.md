# Webhook Security & Signature Verification

## Overview

This service implements robust Razorpay webhook signature verification using HMAC-SHA256 with comprehensive error handling, context logging, and idempotency support.

## Signature Verification

### How It Works

The `verifyRazorpaySignature()` function implements the following security measures:

1. **HMAC-SHA256 Verification**: Generates an expected signature using the webhook secret and compares it with the provided signature
2. **Timing-Safe Comparison**: Uses `crypto.timingSafeEqual()` to prevent timing attacks
3. **Typed Errors**: Throws specific error types (`SignatureVerificationError`, `ValidationError`) for different failure scenarios
4. **Context Logging**: Logs detailed context information for security auditing and debugging

### Implementation

```javascript
const { verifyRazorpaySignature } = require('./services/paymentService');

// Verify webhook signature
try {
  verifyRazorpaySignature(rawBody, signature, webhookSecret);
  // Signature is valid, process webhook
} catch (error) {
  if (error instanceof SignatureVerificationError) {
    // Invalid signature - potential security threat
    console.error('Signature verification failed:', error.context);
  }
}
```

### Validation Checks

The function performs multiple validation checks:

#### 1. Required Parameters
- ✅ Validates webhook body is a non-empty string
- ✅ Validates signature is provided and is a string
- ✅ Validates webhook secret is configured (production mode)

#### 2. Signature Format
- ✅ Ensures signature is a valid hexadecimal string
- ✅ Verifies signature length matches expected HMAC-SHA256 output (64 hex chars)

#### 3. Signature Comparison
- ✅ Generates expected signature using HMAC-SHA256
- ✅ Uses constant-time comparison to prevent timing attacks
- ✅ Throws detailed error on mismatch

### Error Types

#### SignatureVerificationError
Thrown when signature verification fails:
- Invalid signature (mismatch)
- Invalid signature format (non-hex)
- Missing signature
- Signature length mismatch

```javascript
{
  name: 'SignatureVerificationError',
  message: 'Signature verification failed',
  statusCode: 401,
  context: {
    reason: 'signature_mismatch',
    hasBody: true,
    bodyLength: 245,
    hasSignature: true,
    signatureLength: 64,
    duration: '5ms'
  }
}
```

#### ValidationError
Thrown when required parameters are missing or invalid:
- Missing or invalid webhook body
- Missing webhook secret (production mode)

```javascript
{
  name: 'ValidationError',
  message: 'Webhook body must be a non-empty string',
  statusCode: 400,
  context: {
    reason: 'invalid_body',
    bodyType: 'object'
  }
}
```

## Idempotency

### Purpose

Prevents duplicate webhook processing by tracking processed webhook events using idempotency keys.

### Idempotency Key Extraction

The system attempts to extract idempotency keys from multiple sources (in priority order):

1. **Headers** (highest priority):
   - `x-idempotency-key`
   - `idempotency-key`
   - `x-request-id`
   - `request-id`
   - `x-razorpay-event-id` (Razorpay specific)

2. **Request Body**:
   - `body.event_id`
   - `body.payload.payment.entity.id` (generates: `{event}_{paymentId}`)
   - `body.id`

3. **Fallback**: Generates a hash-based key from the request data

### Example

```javascript
const { extractIdempotencyKey } = require('./utils/idempotency');

// From headers
const key1 = extractIdempotencyKey(
  { 'x-idempotency-key': 'key_123' }, 
  {}
);
// Returns: 'key_123'

// From Razorpay webhook structure
const key2 = extractIdempotencyKey({}, {
  event: 'payment.captured',
  payload: {
    payment: {
      entity: { id: 'pay_456' }
    }
  }
});
// Returns: 'payment.captured_pay_456'
```

### Duplicate Detection

```javascript
const { 
  isKeyProcessed, 
  markKeyProcessed, 
  getProcessedResult 
} = require('./utils/idempotency');

// Check if already processed
if (isKeyProcessed(idempotencyKey)) {
  const cachedResult = getProcessedResult(idempotencyKey);
  return cachedResult; // Return cached result
}

// Process webhook...
const result = await processWebhook(payload);

// Mark as processed (cached for 24 hours by default)
markKeyProcessed(idempotencyKey, result);
```

## Context Logging

All signature verification attempts are logged with detailed context:

### Successful Verification
```json
{
  "level": "info",
  "message": "Signature verification successful",
  "hasBody": true,
  "bodyLength": 245,
  "hasSignature": true,
  "signatureLength": 64,
  "hasSecret": true,
  "duration": "3ms"
}
```

### Failed Verification
```json
{
  "level": "error",
  "message": "Signature verification failed: Signature mismatch",
  "hasBody": true,
  "bodyLength": 245,
  "hasSignature": true,
  "signatureLength": 64,
  "providedLength": 64,
  "expectedLength": 64,
  "reason": "signature_mismatch",
  "duration": "5ms"
}
```

### Invalid Parameters
```json
{
  "level": "error",
  "message": "Invalid webhook body provided",
  "hasBody": false,
  "bodyLength": 0,
  "bodyType": "object",
  "reason": "invalid_body"
}
```

## Security Best Practices

### 1. Always Verify Signatures in Production

```javascript
// In production, always configure webhook secret
if (process.env.NODE_ENV === 'production' && !config.razorpay.webhookSecret) {
  throw new Error('Webhook secret must be configured in production');
}
```

### 2. Use Raw Body for Verification

```javascript
// CORRECT: Use raw body string
app.use((req, res, next) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
});

// INCORRECT: Don't use parsed body
// verifyRazorpaySignature(JSON.stringify(req.body), signature, secret);
```

### 3. Handle Errors Appropriately

```javascript
try {
  verifyRazorpaySignature(rawBody, signature, secret);
} catch (error) {
  if (error instanceof SignatureVerificationError) {
    // Log security incident
    logger.error('Potential security threat', {
      error: error.message,
      context: error.context,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    // Return 401
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }
}
```

### 4. Implement Rate Limiting

```javascript
// Add rate limiting to webhook endpoints
const rateLimit = require('express-rate-limit');

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many webhook requests'
});

app.post('/api/webhooks/razorpay', webhookLimiter, webhookController.razorpayWebhook);
```

### 5. Monitor Failed Verification Attempts

```javascript
// Track and alert on repeated failures
const failureTracker = new Map();

function trackFailure(ip) {
  const count = (failureTracker.get(ip) || 0) + 1;
  failureTracker.set(ip, count);
  
  if (count > 5) {
    // Alert security team
    alertSecurityTeam(`Suspicious activity from IP: ${ip}`);
  }
}
```

## Testing

### Unit Tests

Comprehensive tests cover:
- ✅ Valid signature verification
- ✅ Invalid signature detection
- ✅ Missing parameters
- ✅ Invalid signature format
- ✅ Length mismatch detection
- ✅ Timing attack prevention
- ✅ Edge cases (unicode, special characters, large payloads)
- ✅ Idempotency key extraction
- ✅ Duplicate detection
- ✅ Error context logging

### Running Tests

```bash
# Run all tests
npm test

# Run signature verification tests only
npm test tests/services/paymentService.enhanced.test.js

# Run with coverage
npm test -- --coverage
```

### Example Test

```javascript
it('should throw SignatureVerificationError for invalid signature', () => {
  const invalidSignature = crypto
    .createHmac('sha256', 'wrong_secret')
    .update(webhookBody)
    .digest('hex');

  expect(() => {
    verifyRazorpaySignature(webhookBody, invalidSignature, webhookSecret);
  }).toThrow(SignatureVerificationError);
});
```

## Production Deployment Checklist

- [ ] Configure `RAZORPAY_WEBHOOK_SECRET` environment variable
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/TLS for webhook endpoint
- [ ] Implement rate limiting
- [ ] Set up monitoring and alerting for failed verifications
- [ ] Configure log aggregation for security audits
- [ ] Implement IP whitelisting (if Razorpay provides static IPs)
- [ ] Set up webhook retry mechanism
- [ ] Test with Razorpay webhook testing tool
- [ ] Document webhook endpoint URL in Razorpay dashboard

## Troubleshooting

### Signature Verification Failing

1. **Check raw body**: Ensure you're using the raw body string, not parsed JSON
2. **Verify secret**: Confirm webhook secret matches Razorpay dashboard
3. **Check encoding**: Ensure body encoding is UTF-8
4. **Inspect logs**: Check context logging for detailed error information

### Example Debug Script

```javascript
const crypto = require('crypto');

// Your values
const webhookSecret = 'your_secret';
const rawBody = '{"event":"payment.captured"}';
const receivedSignature = 'signature_from_header';

// Generate expected signature
const expectedSignature = crypto
  .createHmac('sha256', webhookSecret)
  .update(rawBody)
  .digest('hex');

console.log('Expected:', expectedSignature);
console.log('Received:', receivedSignature);
console.log('Match:', expectedSignature === receivedSignature);
```

## References

- [Razorpay Webhook Documentation](https://razorpay.com/docs/webhooks/)
- [HMAC-SHA256 Signature Verification](https://en.wikipedia.org/wiki/HMAC)
- [Timing Attack Prevention](https://codahale.com/a-lesson-in-timing-attacks/)

