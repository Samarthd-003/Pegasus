const express = require('express');
const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  logger.info({ message: 'Incoming request', method: req.method, url: req.originalUrl, ip: req.ip });
  res.on('finish', () => {
    logger.info({
      message: 'Request finished',
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ip: req.ip,
    });
  });
  next();
});

app.use('/api', routes);

module.exports = app;
