const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');

const server = app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  server.close(() => process.exit(1));
});

module.exports = server;
