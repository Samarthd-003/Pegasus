# Complete Order Confirmation Flow

## Visual Flow Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                        ORDER CREATION PHASE                         │
└────────────────────────────────────────────────────────────────────┘

    POST /orders
         │
         ├─► orderService.createOrder(orderData)
         │
         ├─► Validate (email, amount, line_items)
         │      └─► Throw ValidationError if invalid
         │
         ├─► Generate internal order ID
         │
         ├─► shopifyService.createShopifyOrder()
         │      │
         │      ├─► Retry with backoff (3 attempts, 30s timeout)
         │      │      │
         │      │      ├─► Network error? → Retry
         │      │      ├─► Timeout? → Retry
         │      │      └─► 5xx error? → Retry
         │      │
         │      ├─► SUCCESS → Get Shopify order ID
         │      │
         │      └─► FAILURE → Use fallback (internal order only)
         │                    Log error, continue gracefully
         │
         ├─► Create internal order object
         │      ├─► status: 'created'
         │      ├─► shopifyOrderId
         │      ├─► shopifyOrderNumber
         │      └─► statusHistory: [{ from: null, to: 'created' }]
         │
         ├─► Store in database (with retry)
         │
         └─► Return order object ✅
                  │
                  └─► { id, email, amount, shopifyOrderId, status: 'created' }


┌────────────────────────────────────────────────────────────────────┐
│                     PAYMENT PROCESSING PHASE                        │
└────────────────────────────────────────────────────────────────────┘

    Customer completes payment on Razorpay
         │
         ├─► Razorpay sends webhook
         │
         └─► POST /webhooks/razorpay
                  │
                  ├─► webhookController.razorpayWebhook()
                  │      │
                  │      ├─► Extract signature from headers
                  │      ├─► Get raw body for verification
                  │      │
                  │      └─► webhookService.handleWebhook()
                  │
                  └─► webhookService.handleWebhook()
                           │
                           ├─► PHASE 1: RECEIVED
                           │      └─► Log incoming webhook
                           │
                           ├─► PHASE 2: VALIDATED ✅
                           │      │
                           │      └─► verifyRazorpaySignature(rawBody, signature)
                           │             │
                           │             ├─► Generate HMAC SHA256
                           │             ├─► Compare with signature (timing-safe)
                           │             ├─► SUCCESS → Continue
                           │             └─► FAILURE → Return 401 ❌
                           │
                           ├─► PHASE 3: IDEMPOTENCY CHECK
                           │      │
                           │      ├─► Extract/generate idempotency key
                           │      ├─► Check if already processed
                           │      │      │
                           │      │      ├─► YES → Return cached result
                           │      │      └─► NO → Continue processing
                           │      │
                           │      └─► Mark as processing
                           │
                           └─► PHASE 4: APPLIED
                                  │
                                  ├─► Route to event handler
                                  │
                                  ├──────────────────────────────────────┐
                                  │                                      │
                    ┌─────────────┴──────────────┐    ┌────────────────┴───────────────┐
                    │                            │    │                                │
              payment.authorized          payment.captured                   payment.failed
                    │                            │                                    │
                    └─► handlePaymentAuthorized  └─► handlePaymentCaptured          │
                           │                            │                             │
                           ├─► persistPayment()         ├─► persistPayment()         │
                           │                            │                             │
                           └─► updateOrderStatus()      ├─► updateOrderStatus()      │
                                   │                    │      │                      │
                                   │                    │      ├─► status: 'paid'    │
                                   │                    │      │                      │
                                   │                    │      └─► Shopify Sync ✅    │
                                   │                    │             │               │
                                   └─► status:          │             ├─► Create      │
                                       'authorized'     │             │   transaction │
                                                       │             │               │
                                                       │             └─► Update       │
                                                       │                 financial   │
                                                       │                 status      │
                                                       │                             │
                                                       └─────────────────────────────┘
                                                                       │
                                                     handlePaymentFailed()
                                                                       │
                                                       ├─► Extract failure details:
                                                       │      ├─► failureReason
                                                       │      ├─► errorCode
                                                       │      ├─► errorDescription
                                                       │      ├─► errorSource
                                                       │      └─► errorStep
                                                       │
                                                       ├─► persistPayment()
                                                       │
                                                       └─► updateOrderStatus()
                                                              │
                                                              └─► status: 'failed'
                                                                  Preserve all failure info ✅


┌────────────────────────────────────────────────────────────────────┐
│                      ORDER STATUS UPDATE PHASE                      │
└────────────────────────────────────────────────────────────────────┘

    updateOrderStatus(orderId, status, additionalData)
         │
         ├─► Get order from store
         │
         ├─► IDEMPOTENCY CHECK
         │      ├─► Check lastIdempotencyKey
         │      ├─► Match? → Return existing order (skip update)
         │      └─► No match? → Continue
         │
         ├─► VALIDATE STATUS TRANSITION
         │      ├─► created → [authorized, paid, failed, cancelled]
         │      ├─► authorized → [paid, failed, cancelled]
         │      ├─► paid → [completed, refunded]
         │      ├─► failed → [created, authorized] (retry)
         │      └─► Log warning if invalid transition
         │
         ├─► PRESERVE FAILURE INFO (if status = 'failed')
         │      │
         │      └─► Add to failureHistory:
         │             ├─► timestamp
         │             ├─► previousStatus
         │             ├─► failureReason
         │             ├─► errorCode
         │             ├─► errorDescription
         │             ├─► paymentId
         │             ├─► idempotencyKey
         │             └─► metadata:
         │                    ├─► attemptNumber
         │                    ├─► paymentMethod
         │                    ├─► paymentAmount
         │                    ├─► paymentCurrency
         │                    ├─► paymentEmail
         │                    └─► failureTimestamp
         │
         ├─► UPDATE STATUS HISTORY
         │      └─► Add to statusHistory:
         │             ├─► from: previousStatus
         │             ├─► to: newStatus
         │             ├─► timestamp
         │             ├─► idempotencyKey
         │             └─► reason
         │
         ├─► UPDATE ORDER OBJECT
         │      ├─► status = newStatus
         │      ├─► previousStatus
         │      ├─► lastIdempotencyKey
         │      ├─► updatedAt
         │      └─► merge additionalData
         │
         ├─► STORE WITH RETRY (2 attempts, 5s timeout)
         │
         └─► SHOPIFY SYNC (if status = 'paid' and syncToShopify = true)
                │
                ├─► shopifyService.confirmShopifyOrderPayment()
                │      │
                │      ├─► Create transaction:
                │      │      ├─► gateway: 'razorpay'
                │      │      ├─► kind: 'capture'
                │      │      ├─► amount
                │      │      ├─► currency
                │      │      └─► authorization: paymentId
                │      │
                │      ├─► Update order:
                │      │      └─► financial_status: 'paid'
                │      │
                │      ├─► SUCCESS → Update shopifySyncedAt
                │      │
                │      └─► FAILURE → Log error, store shopifySyncError
                │                   (Don't fail the order update)
                │
                └─► Return updated order ✅


┌────────────────────────────────────────────────────────────────────┐
│                         RESILIENCE LAYER                            │
└────────────────────────────────────────────────────────────────────┘

    retryWithBackoff(fn, options)
         │
         ├─► Attempt 1
         │      ├─► withTimeout(fn(), 30000ms)
         │      │      ├─► SUCCESS → Return result ✅
         │      │      ├─► TIMEOUT → TimeoutError
         │      │      └─► ERROR → Check if retryable
         │      │
         │      ├─► Is retryable?
         │      │      ├─► Network error (ECONNRESET, ETIMEDOUT, etc.) → YES
         │      │      ├─► HTTP 5xx/429/408 → YES
         │      │      ├─► HTTP 4xx → NO
         │      │      └─► Other → NO
         │      │
         │      └─► If retryable → Wait with exponential backoff
         │
         ├─► Wait (1000ms + jitter)
         │
         ├─► Attempt 2
         │      └─► (same as above)
         │
         ├─► Wait (2000ms + jitter)
         │
         ├─► Attempt 3
         │      └─► (same as above)
         │
         └─► All attempts failed → Throw last error ❌


┌────────────────────────────────────────────────────────────────────┐
│                           LOGGING LAYER                             │
└────────────────────────────────────────────────────────────────────┘

    Every operation logs:
         │
         ├─► START
         │      ├─► Operation name
         │      ├─► Input parameters
         │      └─► Context (IDs, amounts, etc.)
         │
         ├─► PROGRESS
         │      ├─► Retry attempts
         │      ├─► Shopify sync status
         │      └─► Intermediate results
         │
         ├─► WARNINGS
         │      ├─► Invalid transitions
         │      ├─► Fallback usage
         │      └─► Sync failures
         │
         └─► END
                ├─► SUCCESS ✅
                │      ├─► Result summary
                │      ├─► Duration
                │      └─► Key metrics
                │
                └─► FAILURE ❌
                       ├─► Error message
                       ├─► Error code
                       ├─► Stack trace
                       └─► Full context


┌────────────────────────────────────────────────────────────────────┐
│                        STATE TRANSITIONS                            │
└────────────────────────────────────────────────────────────────────┘

    created
       │
       ├──► authorized (payment authorized)
       │       │
       │       ├──► paid (payment captured) ──► Shopify sync ✅
       │       │      │
       │       │      └──► completed (order fulfilled)
       │       │             │
       │       │             └──► refunded
       │       │
       │       ├──► failed (payment failed) ──► Preserve failure info ✅
       │       │      │
       │       │      └──► (can retry → authorized)
       │       │
       │       └──► cancelled
       │
       ├──► paid (direct capture)
       │
       ├──► failed ──► Preserve failure info ✅
       │
       └──► cancelled


┌────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING                              │
└────────────────────────────────────────────────────────────────────┘

    Network Error (ECONNRESET, ETIMEDOUT)
       └─► Retry with exponential backoff
              └─► Max 3 attempts → Fallback or fail

    Timeout (>30s)
       └─► Cancel request → Retry
              └─► Max 3 attempts → Fallback or fail

    HTTP 429 (Rate Limit)
       └─► Wait (respect Retry-After) → Retry
              └─► Max 3 attempts → Fail

    HTTP 5xx (Server Error)
       └─► Wait with backoff → Retry
              └─► Max 3 attempts → Fallback or fail

    HTTP 4xx (Client Error)
       └─► Log error → Fail immediately (no retry)

    Shopify Unavailable
       └─► Order creation: Use fallback (internal only)
       └─► Payment confirmation: Log error, continue
       └─► Order sync: Return cached data

    Signature Verification Failed
       └─► Return 401 immediately (no retry)

    Invalid Order Data
       └─► Return 400 immediately (no retry)

    Database Error
       └─► Retry (2 attempts) → Fail


┌────────────────────────────────────────────────────────────────────┐
│                      IDEMPOTENCY PROTECTION                         │
└────────────────────────────────────────────────────────────────────┘

    Webhook arrives
       │
       ├─► Extract idempotency key
       │      ├─► From Razorpay: event.id
       │      └─► Generated: hash(payload + timestamp)
       │
       ├─► Check cache
       │      ├─► Key exists? → Return cached result
       │      └─► Key new? → Continue processing
       │
       ├─► Process webhook
       │
       └─► Cache result with key
              └─► TTL: 24 hours

    Order status update
       │
       ├─► Check order.lastIdempotencyKey
       │      ├─► Matches? → Return order (no update)
       │      └─► Different? → Continue update
       │
       ├─► Update order
       │
       └─► Store lastIdempotencyKey
              └─► Prevents duplicate updates


┌────────────────────────────────────────────────────────────────────┐
│                      COMPLETE SUCCESS PATH                          │
└────────────────────────────────────────────────────────────────────┘

1. POST /orders → Order created in Shopify + internal store
2. Customer pays → Razorpay processes payment
3. Webhook arrives → Signature verified ✅
4. payment.captured → Order status updated to 'paid'
5. Shopify sync → Transaction created + financial status updated ✅
6. Order complete → Customer receives confirmation

All steps include:
   ✅ Retry logic
   ✅ Timeout protection
   ✅ Comprehensive logging
   ✅ Error handling
   ✅ Idempotency
   ✅ Failure preservation

