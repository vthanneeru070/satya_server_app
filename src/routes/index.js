const express = require("express");
const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");
const poojaRoutes = require("./poojaRoutes");
const donationRoutes = require("./donationRoutes");
const festivalRoutes = require("./festivalRoutes");
const dailySlokaRoutes = require("./dailySlokaRoutes");
const userHomeRoutes = require("./userHomeRoutes");
const calendarRoutes = require("./calendarRoutes");

const router = express.Router();

//routes
router.use("/auth", authRoutes);

//admin routes
router.use("/admin", adminRoutes);

//shared routes
router.use("/poojas", poojaRoutes);
router.use("/donations", donationRoutes);
router.use("/festivals", festivalRoutes);
router.use("/daily-slokas", dailySlokaRoutes);
router.use("/user-home", userHomeRoutes);
router.use("/calendar", calendarRoutes);

module.exports = router;
