const winston = require('winston');
const config = require('../config');

const { combine, timestamp, json } = winston.format;

const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    timestamp(),
    json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

module.exports = logger;
