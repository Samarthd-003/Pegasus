# Pegasus Service

A Node.js Express service with structured logging and a modular design, built to handle orders and webhooks with mock integrations for Shopify and Razorpay.

## Features

- **Express Server**: A robust and minimalist web framework for Node.js.
- **Structured Logging**: Using `winston` for JSON-formatted logs.
- **Environment-based Configuration**: Using `dotenv` to manage environment variables.
- **Modular Structure**: Code is organized into `config`, `controllers`, `services`, `routes`, and `utils`.
- **Health Check**: A `/health` endpoint to monitor the service's status.
- **Order Management**: Stubbed functions for creating, retrieving, and updating orders.
- **Webhook Handling**: Secure webhook endpoint with Razorpay signature verification.
- **Unit Tests**: Comprehensive unit tests for all modules using `jest` and `supertest`.

## Prerequisites

- Node.js (v14 or higher)
- npm

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd pegasus-service
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root of the project and add the following variables. You can use the `.env.example` as a template.

```
PORT=3000
LOG_LEVEL=info
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
WEBHOOK_SECRET=your_webhook_secret
```

### 4. Run the application

To start the server, run:

```bash
npm start
```

For development with automatic restarts, you can use:

```bash
npm run dev
```

The service will be available at `http://localhost:3000`.

## API Endpoints

- `GET /api/health`: Checks the health of the service.
- `POST /api/orders`: Creates a new order.
- `GET /api/orders/:id`: Retrieves an order by its ID.
- `POST /api/orders/webhook`: Handles webhooks from Razorpay.

## Running Tests

To run the unit tests, use the following command:

```bash
npm test
```

This will execute all test files in the `tests/` directory.
