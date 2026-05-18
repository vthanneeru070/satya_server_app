const mongoose = require("mongoose");

/**
 * Per-user inbox row — admin broadcast (notification ref) or transactional
 * message (title/body/type on the row, keyed by sourceKey).
 */
const userNotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Admin broadcast; null for order / transactional inbox items. */
    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      default: null,
      index: true,
    },
    /** Dedupes transactional rows (e.g. order:abc:status:SHIPPED). */
    sourceKey: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    title: { type: String, trim: true, default: null },
    body: { type: String, trim: true, default: null },
    imageUrl: { type: String, default: null },
    type: {
      type: String,
      trim: true,
      default: "ADMIN_BROADCAST",
      index: true,
    },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    sentAt: { type: Date, default: null },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

userNotificationSchema.index({ user: 1, createdAt: -1 });
userNotificationSchema.index(
  { user: 1, notification: 1 },
  {
    unique: true,
    partialFilterExpression: { notification: { $type: "objectId" } },
  }
);
userNotificationSchema.index(
  { user: 1, sourceKey: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceKey: { $type: "string" } },
  }
);

module.exports = mongoose.model("UserNotification", userNotificationSchema);
