const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    phone: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      lowercase: true,
      default: null,
    },
    provider: {
      type: String,
      enum: [ "google", "apple", "password"],
      required: true,
    },
    linkedProviders: {
      type: [String],
      enum: ["google", "apple", "password"],
      default: [],
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastActiveAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ role: 1 });
userSchema.index({ email: 1 });
userSchema.index({ linkedProviders: 1 });

module.exports = mongoose.model("User", userSchema);
