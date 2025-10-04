require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  },
  webhookSecret: process.env.WEBHOOK_SECRET,
};

module.exports = config;
