const mongoose = require("mongoose");

const ritualContentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    imageUrl: {
      type: String,
      default: "",
    }
  },
  { _id: false }
);

const ritualSectionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },

    label: {
      type: String,
      required: true,
      trim: true,
    },

    contents: {
      type: [ritualContentSchema],
      default: [],
    },
  },
  { _id: false }
);

const ritualDaySchema = new mongoose.Schema(
  {
    stepNumber: Number,
    title: String,
    description: String,
    images: [String],
    subSteps: [String],
  },
  { _id: false }
);

const ritualSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      unique: true,
      trim: true,
      lowercase: true,
    },

    description: {
      type: String,
      default: "",
    },

    deity: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Deity",
        },
      ],
      default: [],
    },

    category: {
      type: String,
      default: "",
    },

    purpose: {
      type: String,
      default: "",
    },

    ritualDays: {
      type: Number,
      required: true,
    },

    bestDayTime: {
      type: String,
      default: "",
    },

    startingDay: {
      type: String,
      default: "",
    },

    difficulty: {
      type: String,
      enum: [
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED",
      ],
      default: "BEGINNER",
    },

    // 🪔 Dynamic CMS sections
    sections: {
      type: [ritualSectionSchema],
      default: [],
    },

    // 📅 Multi-day ritual flow
    days: {
      type: [ritualDaySchema],
      default: [],
    },

    // 🎧 Media
    images: {
      type: [String],
      default: [],
    },

    audio: {
      type: [String],
      default: [],
    },

    videos: {
      type: [String],
      default: [],
    },

    // 💰 Access control
    accessType: {
      type: String,
      enum: ["FREE", "PAID"],
      default: "FREE",
    },

    price: {
      type: Number,
      default: 0,
    },

    currency: {
      type: String,
      default: "ZAR",
    },

    // ⭐ Analytics
    isFeatured: {
      type: Boolean,
      default: false,
    },

    viewCount: {
      type: Number,
      default: 0,
    },

    purchaseCount: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "DRAFT",
        "PENDING",
        "APPROVED",
        "REJECTED",
      ],
      default: "PENDING",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        if (ret.deity && !Array.isArray(ret.deity)) {
          ret.deity = [ret.deity];
        }
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        if (ret.deity && !Array.isArray(ret.deity)) {
          ret.deity = [ret.deity];
        }
        return ret;
      },
    },
  }
);

module.exports = mongoose.model(
  "Ritual",
  ritualSchema
);