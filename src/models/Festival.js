const mongoose = require("mongoose");

const festivalSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    date: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    image: {
      type: String,
      required: false,
    },
    rituals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ritual",
      },
    ],
    category: {
      type: String,
      enum: ["MAJOR", "MINOR", "FASTING", "ECLIPSE"],
      default: "MAJOR",
    },
    isGlobal: {
      type: Boolean,
      default: true,
    },
    location: {
      country: String,
      state: String,
      city: String,
    },
    notifyUsers: {
      type: Boolean,
      default: true,
    },
    notificationDaysBefore: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    isVisible: {
      type: Boolean,
      default: false,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Festival", festivalSchema);
