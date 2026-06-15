const { normalizeProductInput } = require("../validations/productValidation");

const trimBodyKeys = (body) => {
  if (!body || typeof body !== "object") return {};
  const next = {};
  for (const [key, value] of Object.entries(body)) {
    next[String(key).trim()] = value;
  }
  return next;
};

/**
 * Multipart clients sometimes send `stockQuantity` instead of `quantity`, or
 * include stray whitespace in field names. Normalize before Joi validation.
 */
const normalizeProductBody = (req, _res, next) => {
  req.body = normalizeProductInput(trimBodyKeys(req.body));
  return next();
};

module.exports = normalizeProductBody;
