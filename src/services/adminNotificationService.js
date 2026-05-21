const mongoose = require("mongoose");
const admin = require("../config/firebase");
const User = require("../models/User");
const Donation = require("../models/Donation");
const AdminNotification = require("../models/AdminNotification");
const AdminNotificationRead = require("../models/AdminNotificationRead");
const HttpError = require("../utils/httpError");
const { toFcmData } = require("../utils/fcmData");
const { ADMIN_NOTIFICATION_TYPES } = require("../constants/adminNotificationTypes");

const FCM_MULTICAST_LIMIT = 500;
const ADMIN_ROLES = ["admin", "superadmin"];
const notDeleted = { isDeleted: { $ne: true } };

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

const formatMoney = (amount, currency = "ZAR") => {
  if (typeof amount !== "number" || Number.isNaN(amount)) return currency;
  return `${currency} ${amount.toFixed(2)}`;
};

/**
 * Reusable admin notification + FCM service.
 * Flow: persist Mongo history → multicast FCM to all admin tokens → prune dead tokens.
 */
class AdminNotificationService {
  formatItem(row, read = false) {
    return {
      id: String(row._id),
      type: row.type,
      title: row.title,
      body: row.body || "",
      data: row.data || null,
      read: Boolean(read),
      createdAt: row.createdAt,
    };
  }

  /** Collect unique FCM tokens for every active admin / superadmin. */
  async collectAdminTokens() {
    const admins = await User.find({
      role: { $in: ADMIN_ROLES },
      isDeleted: { $ne: true },
      fcmTokens: { $exists: true, $not: { $size: 0 } },
    }).select("fcmTokens");

    return [...new Set(admins.flatMap((u) => u.fcmTokens || []).filter(Boolean))];
  }

  /** Remove tokens Firebase reports as invalid. */
  async pruneDeadTokens(deadTokens) {
    if (!deadTokens?.length) return 0;
    const res = await User.updateMany(
      { fcmTokens: { $in: deadTokens } },
      {
        $pull: {
          fcmTokens: { $in: deadTokens },
          fcmDevices: { token: { $in: deadTokens } },
        },
      }
    );
    return res.modifiedCount || 0;
  }

  /**
   * Send one multicast batch; returns dead tokens for cleanup.
   */
  async sendMulticastBatch(tokens, { title, body, data }, logTag = "adminFcm") {
    if (!tokens.length) {
      console.warn(`[fcm] ${logTag}: no admin FCM tokens registered`);
      return { sent: 0, failed: 0, deadTokens: [] };
    }

    const deadTokens = [];
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
      const batch = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          data: toFcmData(data),
          android: {
            priority: "high",
            notification: {
              channelId: "satya_default",
              sound: "default",
            },
          },
          apns: {
            headers: { "apns-priority": "10" },
            payload: { aps: { sound: "default" } },
          },
        });

        sent += response.successCount;
        failed += response.failureCount;
        response.responses.forEach((r, idx) => {
          if (!r.success && INVALID_TOKEN_ERRORS.has(r.error?.code)) {
            deadTokens.push(batch[idx]);
          }
        });
      } catch (err) {
        console.error(`[fcm] ${logTag} batch error:`, err?.message || err);
        failed += batch.length;
      }
    }

    if (deadTokens.length) {
      await this.pruneDeadTokens(deadTokens);
    }

    return { sent, failed, deadTokens };
  }

  /** Push to every admin device (best-effort; never throws). */
  async pushToAllAdmins({ title, body, data }, logTag = "adminPush") {
    try {
      const tokens = await this.collectAdminTokens();
      return this.sendMulticastBatch(tokens, { title, body, data }, logTag);
    } catch (err) {
      console.warn(`[fcm] ${logTag} failed:`, err?.message || err);
      return { sent: 0, failed: 0, deadTokens: [] };
    }
  }

  /**
   * Save notification history (upsert by sourceKey) then send FCM.
   */
  async recordAndNotify({
    type,
    sourceKey,
    title,
    body,
    data,
    logTag = "adminNotification",
  }) {
    if (!type || !sourceKey || !title) {
      return { notification: null, push: { sent: 0, failed: 0 } };
    }

    let notification = null;
    try {
      notification = await AdminNotification.findOneAndUpdate(
        { sourceKey },
        {
          $setOnInsert: { isDeleted: false },
          $set: {
            type,
            title,
            body: body || "",
            data: data || null,
          },
        },
        { upsert: true, returnDocument: "after" }
      );
    } catch (err) {
      console.warn(`[adminNotification] persist(${sourceKey}):`, err?.message || err);
    }

    const push = await this.pushToAllAdmins(
      {
        title,
        body: body || "",
        data: { ...data, type },
      },
      logTag
    );

    return { notification, push };
  }

  // ── Typed helpers (order / payment / refund) ─────────────────────────────

  async notifyNewOrder(order) {
    if (!order?._id) return null;

    let buyerName = "";
    const userRef = order.user;
    if (userRef && typeof userRef === "object") {
      buyerName = userRef.fullName || userRef.email || "";
    } else if (userRef) {
      const buyer = await User.findById(userRef).select("fullName email").lean();
      buyerName = buyer?.fullName || buyer?.email || "";
    }

    const orderNumber = order.orderNumber || "";
    const total = formatMoney(order.totalAmount, order.currency);
    const title = "New order";
    const body = orderNumber
      ? `Order ${orderNumber} — ${total}${buyerName ? ` from ${buyerName}` : ""}`
      : `New paid order — ${total}`;

    const data = {
      type: ADMIN_NOTIFICATION_TYPES.NEW_ORDER,
      orderId: String(order._id),
      orderNumber: String(orderNumber),
      userId: userRef
        ? String(typeof userRef === "object" ? userRef._id : userRef)
        : "",
      totalAmount: String(order.totalAmount ?? ""),
      currency: String(order.currency || "ZAR"),
      paystackReference: String(order.paystackReference || ""),
    };

    return this.recordAndNotify({
      type: ADMIN_NOTIFICATION_TYPES.NEW_ORDER,
      sourceKey: `order:${order._id}:${ADMIN_NOTIFICATION_TYPES.NEW_ORDER}`,
      title,
      body,
      data,
      logTag: "notifyNewOrder",
    });
  }

  async notifyPaymentSuccessForDonation(contribution) {
    if (!contribution?._id) return null;

    let donationTitle = "";
    const donationRef = contribution.donation;
    if (donationRef && typeof donationRef === "object") {
      donationTitle = donationRef.title || "";
    } else if (donationRef) {
      const d = await Donation.findById(donationRef).select("title").lean();
      donationTitle = d?.title || "";
    }

    const amount = formatMoney(contribution.amount, contribution.currency);
    const title = "Payment received";
    const body = donationTitle
      ? `Donation ${amount} for "${donationTitle}"`
      : `Donation payment ${amount} received`;

    const data = {
      type: ADMIN_NOTIFICATION_TYPES.PAYMENT_SUCCESS,
      paymentFor: "DONATION",
      contributionId: String(contribution._id),
      contributionNumber: String(contribution.contributionNumber || ""),
      donationId: donationRef
        ? String(typeof donationRef === "object" ? donationRef._id : donationRef)
        : "",
      donationTitle: String(donationTitle),
      amount: String(contribution.amount ?? ""),
      currency: String(contribution.currency || "ZAR"),
    };

    return this.recordAndNotify({
      type: ADMIN_NOTIFICATION_TYPES.PAYMENT_SUCCESS,
      sourceKey: `donation:${contribution._id}:${ADMIN_NOTIFICATION_TYPES.PAYMENT_SUCCESS}`,
      title,
      body,
      data,
      logTag: "notifyPaymentSuccessDonation",
    });
  }

  async notifyRefundRequest(request) {
    if (!request?._id) return null;

    const orderNumber =
      request.order?.orderNumber ||
      (typeof request.order === "object" ? "" : "") ||
      "";
    const title = "Refund request";
    const body = request.requestNumber
      ? `${request.requestNumber}${orderNumber ? ` for order ${orderNumber}` : ""}`
      : "A customer submitted a refund request";

    const data = {
      type: ADMIN_NOTIFICATION_TYPES.REFUND_REQUEST,
      requestId: String(request._id),
      requestNumber: String(request.requestNumber || ""),
      orderId: String(
        request.order?._id || request.order || ""
      ),
      orderNumber: String(orderNumber),
      userId: String(request.user?._id || request.user || ""),
    };

    return this.recordAndNotify({
      type: ADMIN_NOTIFICATION_TYPES.REFUND_REQUEST,
      sourceKey: `order-request:${request._id}:${ADMIN_NOTIFICATION_TYPES.REFUND_REQUEST}`,
      title,
      body,
      data,
      logTag: "notifyRefundRequest",
    });
  }

  async notifyReplacementRequest(request) {
    if (!request?._id) return null;

    const title = "Replacement request";
    const body = request.requestNumber
      ? `${request.requestNumber} — review in admin panel`
      : "New replacement request";

    const data = {
      type: ADMIN_NOTIFICATION_TYPES.REPLACEMENT_REQUEST,
      requestId: String(request._id),
      requestNumber: String(request.requestNumber || ""),
      orderId: String(request.order?._id || request.order || ""),
    };

    return this.recordAndNotify({
      type: ADMIN_NOTIFICATION_TYPES.REPLACEMENT_REQUEST,
      sourceKey: `order-request:${request._id}:${ADMIN_NOTIFICATION_TYPES.REPLACEMENT_REQUEST}`,
      title,
      body,
      data,
      logTag: "notifyReplacementRequest",
    });
  }

  // ── Inbox API (per logged-in admin) ────────────────────────────────────────

  async readIdsForAdmin(adminId) {
    return AdminNotificationRead.find({ admin: adminId }).distinct("notification");
  }

  async listForAdmin(adminId, query = {}) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const filter = { ...notDeleted };
    if (query.type) filter.type = query.type;

    const unreadOnly =
      query.unreadOnly === true || query.unreadOnly === "true";
    if (unreadOnly) {
      const readIds = await this.readIdsForAdmin(adminId);
      if (readIds.length) filter._id = { $nin: readIds };
    }

    const [rows, total, readIds] = await Promise.all([
      AdminNotification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminNotification.countDocuments(filter),
      this.readIdsForAdmin(adminId),
    ]);

    const readSet = new Set(readIds.map(String));
    const notifications = rows.map((r) =>
      this.formatItem(r, readSet.has(String(r._id)))
    );
    const unreadCount = await this.countUnread(adminId);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async countUnread(adminId) {
    const readIds = await this.readIdsForAdmin(adminId);
    const filter = { ...notDeleted };
    if (readIds.length) filter._id = { $nin: readIds };
    return AdminNotification.countDocuments(filter);
  }

  async getById(adminId, notificationId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new HttpError("Notification not found", 404);
    }
    const row = await AdminNotification.findOne({
      _id: notificationId,
      ...notDeleted,
    }).lean();
    if (!row) throw new HttpError("Notification not found", 404);

    const read = await AdminNotificationRead.exists({
      admin: adminId,
      notification: notificationId,
    });
    return { notification: this.formatItem(row, Boolean(read)) };
  }

  async markAsRead(adminId, notificationId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new HttpError("Notification not found", 404);
    }
    const row = await AdminNotification.findOne({
      _id: notificationId,
      ...notDeleted,
    });
    if (!row) throw new HttpError("Notification not found", 404);

    await AdminNotificationRead.findOneAndUpdate(
      { notification: notificationId, admin: adminId },
      { $set: { readAt: new Date() } },
      { upsert: true }
    );

    return { notification: this.formatItem(row.toObject(), true) };
  }

  async markAllAsRead(adminId) {
    const readIds = await this.readIdsForAdmin(adminId);
    const filter = { ...notDeleted };
    if (readIds.length) filter._id = { $nin: readIds };

    const unread = await AdminNotification.find(filter).select("_id").lean();
    if (!unread.length) return { modifiedCount: 0 };

    const now = new Date();
    const ops = unread.map((row) => ({
      updateOne: {
        filter: { notification: row._id, admin: adminId },
        update: { $set: { readAt: now } },
        upsert: true,
      },
    }));

    const result = await AdminNotificationRead.bulkWrite(ops, { ordered: false });
    return {
      modifiedCount: (result.upsertedCount || 0) + (result.modifiedCount || 0),
    };
  }
}

module.exports = new AdminNotificationService();
