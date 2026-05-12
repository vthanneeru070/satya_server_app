const mongoose = require("mongoose");

/**
 * Admin broadcast notification record.
 *
 * Stores one record per "Send Push Notification" action from the admin panel.
 * Supports immediate sends (scheduledAt === null) and scheduled sends
 * (scheduledAt in the future, status: SCHEDULED, picked up by the dispatcher).
 *
 * Per-user delivery records are NOT stored here — that would explode for All
 * Users broadcasts. We persist aggregate counts and let FCM diagnostics live
 * in server logs.
 */
const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },

    /**
     * Target audience:
     *   ALL        — every active user with at least one fcmToken
     *   USERS      — role === "user"
     *   ADMINS     — role === "admin"
     *   SUPERADMIN — role === "superadmin"
     *   USER_IDS   — explicit list, requires userIds[]
     */
    audience: {
      type: String,
      enum: ["ALL", "USERS", "ADMINS", "SUPERADMIN", "USER_IDS"],
      default: "ALL",
      index: true,
    },
    userIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ],

    data: { type: mongoose.Schema.Types.Mixed, default: null },
    imageUrl: { type: String, default: null },

    scheduledAt: { type: Date, default: null, index: true },

    /**
     * Lifecycle:
     *   PENDING   — created, not yet processed (transient)
     *   SCHEDULED — scheduledAt set, waiting for dispatcher
     *   SENDING   — dispatcher picked it up (used to prevent double-send)
     *   SENT      — dispatch completed (some/all targets attempted)
     *   FAILED    — dispatcher errored before any sends
     *   CANCELLED — admin cancelled before send
     */
    status: {
      type: String,
      enum: ["PENDING", "SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },

    sentAt: { type: Date, default: null },

    targetedUserCount: { type: Number, default: 0 },
    targetedTokenCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    prunedTokenCount: { type: Number, default: 0 },
    errorMessage: { type: String, default: null },

    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ status: 1, scheduledAt: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
