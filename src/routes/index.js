const express = require("express");
const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");
const poojaRoutes = require("./poojaRoutes");
const donationRoutes = require("./donationRoutes");
const festivalRoutes = require("./festivalRoutes");
const dailySlokaRoutes = require("./dailySlokaRoutes");
const userHomeRoutes = require("./userHomeRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/poojas", poojaRoutes);
router.use("/donations", donationRoutes);
router.use("/festivals", festivalRoutes);
router.use("/daily-slokas", dailySlokaRoutes);
router.use("/user-home", userHomeRoutes);

module.exports = router;
