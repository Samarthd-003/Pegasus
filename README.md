# Pegasus Payment Service

A modular Node.js Express service for handling payment processing with Razorpay and Shopify integrations. Features structured logging, environment-based configuration, and comprehensive unit testing.

## Features

- ✅ RESTful API with Express.js
- ✅ Health check endpoint
- ✅ Structured logging with Winston
- ✅ Environment-based configuration
- ✅ Mock data for Shopify & Razorpay integrations
- ✅ Webhook signature verification
- ✅ Comprehensive unit tests with Jest
- ✅ Modular and clean folder structure
- ✅ Error handling middleware
- ✅ Request logging middleware
- ✅ Security headers with Helmet
- ✅ CORS enabled

## Project Structure

```
pegasus/
├── src/
│   ├── config/              # Configuration files
│   │   └── index.js         # Environment-based config
│   ├── controllers/         # Request handlers
│   │   ├── healthController.js
│   │   ├── orderController.js
│   │   └── webhookController.js
│   ├── middleware/          # Express middleware
│   │   ├── errorHandler.js
│   │   ├── rawBodyParser.js
│   │   └── requestLogger.js
│   ├── mocks/              # Mock data for third-party APIs
│   │   ├── razorpay.mock.js
│   │   └── shopify.mock.js
│   ├── routes/             # API routes
│   │   └── index.js
│   ├── services/           # Business logic layer
│   │   ├── orderService.js
│   │   ├── paymentService.js
│   │   └── webhookService.js
│   ├── utils/              # Utility functions
│   │   └── logger.js       # Winston logger setup
│   ├── app.js              # Express app setup
│   └── server.js           # Server entry point
├── tests/                  # Unit tests
│   ├── services/
│   ├── controllers/
│   └── app.test.js
├── logs/                   # Log files (auto-generated)
├── package.json
├── env.example             # Environment variables template
└── README.md
```

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Pegasus
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   # Copy the example environment file
   cp env.example .env
   
   # Edit .env with your actual values
   ```

4. **Environment Variables:**

   Edit the `.env` file with your configuration:

   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Razorpay Configuration
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret
   RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

   # Shopify Configuration
   SHOPIFY_STORE_URL=your-store.myshopify.com
   SHOPIFY_API_KEY=your_shopify_api_key
   SHOPIFY_API_SECRET=your_shopify_api_secret
   SHOPIFY_ACCESS_TOKEN=your_shopify_access_token

   # Logging
   LOG_LEVEL=info
   ```

## Running the Service

### Development Mode (with hot reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The service will start on `http://localhost:3000` (or the PORT specified in .env).

## Running Tests

### Run all tests:
```bash
npm test
```

### Run tests in watch mode:
```bash
npm run test:watch
```

### Run tests with coverage:
```bash
npm test -- --coverage
```

## API Endpoints

### Health Check
```
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-10-04T12:00:00.000Z",
  "uptime": 123.456,
  "service": "pegasus-payment-service",
  "version": "1.0.0",
  "environment": "development"
}
```

### Create Order
```
POST /api/orders
```

**Request Body:**
```json
{
  "amount": 50000,
  "currency": "INR",
  "receipt": "receipt_123",
  "customer_email": "customer@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "id": "order_1696425600000_abc123",
    "amount": 50000,
    "currency": "INR",
    "status": "created",
    "razorpayOrderId": "order_Mock123456789",
    "shopifyOrderId": 4567890123,
    "createdAt": "2023-10-04T12:00:00.000Z",
    "updatedAt": "2023-10-04T12:00:00.000Z"
  }
}
```

### Get Order by ID
```
GET /api/orders/:orderId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "order_1696425600000_abc123",
    "amount": 50000,
    "status": "created",
    ...
  }
}
```

### Update Order Status
```
PATCH /api/orders/:orderId/status
```

**Request Body:**
```json
{
  "status": "paid",
  "paymentId": "pay_123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "id": "order_1696425600000_abc123",
    "status": "paid",
    "paymentId": "pay_123",
    "updatedAt": "2023-10-04T12:05:00.000Z"
  }
}
```

### Razorpay Webhook
```
POST /api/webhooks/razorpay
```

**Headers:**
```
x-razorpay-signature: <signature>
```

**Request Body:**
```json
{
  "entity": "event",
  "account_id": "acc_123",
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_123",
        "order_id": "order_123",
        "amount": 50000,
        "currency": "INR",
        "status": "captured"
      }
    }
  }
}
```

## Service Functions

All the following functions are implemented and tested:

### Order Service (`src/services/orderService.js`)

- **`createOrder(orderData)`** - Creates a new order with mock Razorpay and Shopify integration
- **`getOrderById(orderId)`** - Retrieves an order by its ID
- **`updateOrderStatus(orderId, status, additionalData)`** - Updates order status with additional data

### Payment Service (`src/services/paymentService.js`)

- **`verifyRazorpaySignature(webhookBody, signature, secret)`** - ✨ **Enhanced** - Verifies webhook signature using HMAC-SHA256 with:
  - Timing-safe comparison to prevent timing attacks
  - Typed errors (`SignatureVerificationError`, `ValidationError`)
  - Comprehensive context logging for security auditing
  - Multiple validation checks (format, length, content)
- **`persistPayment(paymentData)`** - Persists payment information to storage
- **`getPaymentById(paymentId)`** - Retrieves payment by ID

### Webhook Service (`src/services/webhookService.js`)

- **`handleWebhook(webhookPayload, signature, rawBody, headers)`** - ✨ **Enhanced** - Main webhook handler with:
  - HMAC-SHA256 signature verification (throws on mismatch)
  - Idempotency key extraction from headers/body
  - Duplicate request detection
  - Context logging with duration tracking
- Supports events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`

### Idempotency Utils (`src/utils/idempotency.js`)

- **`extractIdempotencyKey(headers, body)`** - Extracts idempotency key from multiple sources
- **`generateIdempotencyKey(data)`** - Generates fallback idempotency key
- **`isKeyProcessed(key)`** - Checks if webhook was already processed
- **`markKeyProcessed(key, result, ttl)`** - Marks webhook as processed with caching
- **`getProcessedResult(key)`** - Retrieves cached result for duplicate requests

## Mock Data

The service includes comprehensive mock data for:

### Razorpay Integration
- Mock order creation responses
- Mock payment responses
- Mock webhook payloads
- Example signature generation

### Shopify Integration
- Mock order data with line items
- Mock customer data
- Mock address data
- Mock webhook configurations

See `src/mocks/` directory for details.

## Logging

Structured logging is implemented using Winston:

- **Console logs**: Pretty-printed with colors (development)
- **File logs**: 
  - `logs/error.log` - Error logs only
  - `logs/combined.log` - All logs
- **Log format**: JSON with timestamps
- **Log levels**: error, warn, info, debug

Example log entry:
```json
{
  "timestamp": "2023-10-04 12:00:00",
  "level": "info",
  "message": "Order created successfully",
  "service": "pegasus-payment-service",
  "orderId": "order_123",
  "order": { ... }
}
```

## Testing

The project includes comprehensive unit tests for:

- ✅ All service functions
- ✅ All controllers
- ✅ ✨ **Enhanced webhook signature verification** (40+ test cases)
  - Valid/invalid signatures
  - Missing parameters
  - Format validation
  - Length mismatch detection
  - Timing attack prevention
  - Edge cases (unicode, special chars, large payloads)
- ✅ ✨ **Idempotency utilities** (15+ test cases)
  - Key extraction from multiple sources
  - Duplicate detection
  - TTL expiration
  - Edge cases
- ✅ Error handling with typed errors
- ✅ API endpoints (integration tests)

Test coverage includes:
- Happy paths
- Error scenarios
- Edge cases
- Invalid input handling
- Security edge cases

## Security Features

- **Helmet.js**: Security headers
- **CORS**: Cross-origin resource sharing
- **✨ Enhanced Webhook Signature Verification**: 
  - HMAC-SHA256 validation with timing-safe comparison
  - Typed errors with detailed context logging
  - Multiple validation checks (format, length, content)
  - Protection against timing attacks
- **✨ Idempotency Support**:
  - Automatic duplicate webhook detection
  - Multiple idempotency key sources
  - Configurable TTL for cached results
- **Environment Variables**: Sensitive data not hardcoded
- **Error Handling**: Sanitized error responses with typed errors

## Development

### Adding a New Endpoint

1. Create controller in `src/controllers/`
2. Add route in `src/routes/index.js`
3. Implement business logic in `src/services/`
4. Add unit tests in `tests/`

### Adding Mock Data

1. Add mock data to `src/mocks/`
2. Import and use in services
3. Update tests to use mock data

## Production Considerations

For production deployment, consider:

1. **Database Integration**: Replace in-memory stores with actual database (PostgreSQL, MongoDB, etc.)
2. **Redis/Cache**: Add caching layer for performance
3. **Queue System**: Use Bull/RabbitMQ for webhook processing
4. **Monitoring**: Add APM tools (New Relic, DataDog, etc.)
5. **Load Balancing**: Use Nginx or AWS ELB
6. **Process Manager**: Use PM2 for process management
7. **Environment**: Set `NODE_ENV=production`
8. **Logging**: Configure log rotation and external log aggregation
9. **Rate Limiting**: Add rate limiting middleware
10. **Authentication**: Add JWT/OAuth for protected endpoints

## Troubleshooting

### Port Already in Use
```bash
# Change PORT in .env file or kill the process using the port
lsof -ti:3000 | xargs kill -9  # Unix/Mac
netstat -ano | findstr :3000   # Windows
```

### Tests Failing
```bash
# Clear Jest cache
npm test -- --clearCache

# Run tests in sequence
npm test -- --runInBand
```

## License

MIT

## Support

For issues or questions, please create an issue in the repository.

