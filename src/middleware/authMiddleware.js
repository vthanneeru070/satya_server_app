// Re-export of `authenticate` under the spec name `authMiddleware`.
// Verifies the server-issued JWT and attaches req.user.
module.exports = require("./authenticate");
