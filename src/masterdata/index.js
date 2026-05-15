/**
 * Master data registry.
 *
 * Structure:
 *   masterdata/<domain>/<entity>/
 *     constants.js   — canonical codes / seed rows
 *     model.js       — Mongoose schema (when persisted)
 *     service.js     — list, seed, assertValid
 *     validation.js  — Joi helpers (optional)
 *     index.js       — barrel export
 *
 * Add new domains as siblings of `inventory/` (e.g. `catalog/`, `orders/`).
 */
const inventory = require("./inventory");

module.exports = {
  inventory,
};
