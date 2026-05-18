const mongoose = require("mongoose");

/**
 * Per-user inbox row for a broadcast (or future in-app notification).
 * Created when an admin push is dispatched to this user.
 */
const userNotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      required: true,
      index: true,
    },
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
  { unique: true }
);

module.exports = mongoose.model("UserNotification", userNotificationSchema);
