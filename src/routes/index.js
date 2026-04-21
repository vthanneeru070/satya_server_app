const express = require("express");
const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");
const poojaRoutes = require("./poojaRoutes");
const donationRoutes = require("./donationRoutes");
const festivalRoutes = require("./festivalRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/poojas", poojaRoutes);
router.use("/donations", donationRoutes);
router.use("/festivals", festivalRoutes);

module.exports = router;
