const express = require("express");
const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);

module.exports = router;
