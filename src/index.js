const express = require('express');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const healthRoutes = require('./routes/health');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/health', healthRoutes);

const server = app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});

module.exports = { app, server };
