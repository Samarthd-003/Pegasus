const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
};
