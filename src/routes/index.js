const express = require("express");
const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");
const superAdminRoutes = require("./superAdminRoutes");
const poojaRoutes = require("./poojaRoutes");
const ritualRoutes = require("./ritualRoutes");
const donationRoutes = require("./donationRoutes");
const festivalRoutes = require("./festivalRoutes");
const dailySlokaRoutes = require("./dailySlokaRoutes");
const userHomeRoutes = require("./userHomeRoutes");
const userStreakRoutes = require("./userStreakRoutes");
const userPoojaHistoryRoutes = require("./userPoojaHistoryRoutes");
const calendarRoutes = require("./calendarRoutes");
const deityRoutes = require("./deityRoutes");
const productRoutes = require("./productRoutes");
const inventoryRoutes = require("./inventoryRoutes");
const cartRoutes = require("./cartRoutes");
const orderRoutes = require("./orderRoutes");
const orderRequestRoutes = require("./orderRequestRoutes");
const replacementRoutes = require("./replacementRoutes");
const replacementAdminRoutes = require("./replacementAdminRoutes");
const paymentRoutes = require("./paymentRoutes");
const fcmRoutes = require("./fcmRoutes");
const notificationRoutes = require("./notificationRoutes");
const globalSearchRoutes = require("./globalSearchRoutes");
const userNotificationRoutes = require("./userNotificationRoutes");
const adminNotificationRoutes = require("./adminNotificationRoutes");

const router = express.Router();

// auth
router.use("/auth", authRoutes);

// admin & superadmin — register `/admin/replacements` before `/admin` so paths
// are not swallowed by the generic admin router.
router.use("/admin/replacements", replacementAdminRoutes);
router.use("/admin/notifications", adminNotificationRoutes);
router.use("/admin", adminRoutes);
router.use("/superadmin", superAdminRoutes);

// shared / domain routes
router.use("/poojas", poojaRoutes);
router.use("/rituals", ritualRoutes);
router.use("/donations", donationRoutes);
router.use("/festivals", festivalRoutes);
router.use("/daily-slokas", dailySlokaRoutes);
router.use("/user-home", userHomeRoutes);
router.use("/user/streak", userStreakRoutes);
router.use("/user/pooja-history", userPoojaHistoryRoutes);
router.use("/search", globalSearchRoutes);
router.use("/user/notifications", userNotificationRoutes);
router.use("/calendar", calendarRoutes);
router.use("/deities", deityRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/products", productRoutes);
router.use("/cart", cartRoutes);
router.use("/replacements", replacementRoutes);
// Mount request-specific routes BEFORE generic orderRoutes so paths like
// `/orders/requests/my` are not eaten by `/orders/:id`.
router.use("/orders", orderRequestRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/fcm", fcmRoutes);
router.use("/notifications", notificationRoutes);

module.exports = router;
