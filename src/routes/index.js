const express = require("express");
const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");
const superAdminRoutes = require("./superAdminRoutes");
const poojaRoutes = require("./poojaRoutes");
const donationRoutes = require("./donationRoutes");
const festivalRoutes = require("./festivalRoutes");
const dailySlokaRoutes = require("./dailySlokaRoutes");
const userHomeRoutes = require("./userHomeRoutes");
const calendarRoutes = require("./calendarRoutes");
const deityRoutes = require("./deityRoutes");
const productRoutes = require("./productRoutes");
const cartRoutes = require("./cartRoutes");
const orderRoutes = require("./orderRoutes");
const paymentRoutes = require("./paymentRoutes");
const fcmRoutes = require("./fcmRoutes");
const notificationRoutes = require("./notificationRoutes");

const router = express.Router();

// auth
router.use("/auth", authRoutes);

// admin & superadmin
router.use("/admin", adminRoutes);
router.use("/superadmin", superAdminRoutes);

// shared / domain routes
router.use("/poojas", poojaRoutes);
router.use("/donations", donationRoutes);
router.use("/festivals", festivalRoutes);
router.use("/daily-slokas", dailySlokaRoutes);
router.use("/user-home", userHomeRoutes);
router.use("/calendar", calendarRoutes);
router.use("/deities", deityRoutes);
router.use("/products", productRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/fcm", fcmRoutes);
router.use("/notifications", notificationRoutes);

module.exports = router;
