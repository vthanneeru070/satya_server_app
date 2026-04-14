const { sendError } = require("../utils/response");

const notFound = (_req, res) => {
  return sendError(res, "Route not found", 404);
};

module.exports = notFound;
