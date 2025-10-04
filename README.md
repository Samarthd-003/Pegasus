# Pegasus API

This is a Node.js Express service for the Pegasus project.

## Prerequisites

- Node.js
- npm

## Installation

1. Clone the repository
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root of the project and add the following:
   ```
   PORT=3000
   ```

## Usage

### Development

To run the server in development mode with automatic restarts, run:

```bash
npm run dev
```

### Production

To run the server in production, run:

```bash
npm start
```

## Running Tests

To run the unit tests, run:

```bash
npm test
```

## API Endpoints

### Health Check

- **GET /health**

  Returns the health status of the service.

  **Response:**

  ```json
  {
    "status": "UP"
  }
  ```
