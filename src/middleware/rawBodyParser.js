/**
 * Middleware to capture raw body for webhook signature verification
 * This must be applied before body-parser/express.json()
 */
function rawBodyParser(req, res, next) {
  let data = '';
  
  req.on('data', (chunk) => {
    data += chunk;
  });

  req.on('end', () => {
    req.rawBody = data;
    next();
  });
}

module.exports = rawBodyParser;

