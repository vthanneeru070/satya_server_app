const authorizeRoles = require("./authorizeRoles");

// Allow admin OR superadmin (superadmin is implicitly granted by authorizeRoles).
module.exports = authorizeRoles("admin");
