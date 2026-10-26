const authenticate = require("./authenticate");

/**
 * Attaches req.user when a valid Bearer token is present.
 * Requests with no token, or with an invalid token, continue as guests.
 */
const optionalAuthenticate = (req, res, next) => {
  const header = String(req.headers.authorization || "").trim();
  if (!header) return next();

  return authenticate(req, res, (err) => {
    if (err) return next();
    return next();
  });
};

module.exports = optionalAuthenticate;
