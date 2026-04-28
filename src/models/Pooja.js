const mongoose = require("mongoose");

const keyValueSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
  },
  { _id: false }
);

// 🔥 Step Schema (IMPORTANT)
const stepSchema = new mongoose.Schema(
  {
    stepNumber: Number,
    title: String,
    description: String,
    subSteps: [String], // for detailed instructions
  },
  { _id: false }
);

// 🔥 Preparation Schema
const preparationSchema = new mongoose.Schema(
  {
    personal: [String],
    space: [String],
    items: [String],
  },
  { _id: false }
);

// 🔥 Mantra Schema
const mantraSchema = new mongoose.Schema(
  {
    primary: String,
    repetitions: String,
    additional: [String],
    meaning: String,
  },
  { _id: false }
);

// 🔥 Spiritual Meaning
const spiritualSchema = new mongoose.Schema(
  {
    offeringsMeaning: [keyValueSchema],
    actionsMeaning: [keyValueSchema],
    otherSymbolism: [keyValueSchema],
  },
  { _id: false }
);

// 🔥 Devotional Guidance
const guidanceSchema = new mongoose.Schema(
  {
    mindset: [String],
    avoid: [String],
  },
  { _id: false }
);

// 🔥 Completion
const completionSchema = new mongoose.Schema(
  {
    closure: [String],
    integration: [String],
    benefits: [String],
  },
  { _id: false }
);

const poojaSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    deity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deity", // 🔥 changed to reference
      required: true,
    },

    category: String,
    difficulty: String,
    duration: String,

    description: String,

    // 🔥 NEW SECTIONS
    purpose: {
      why: String,
      benefits: [String],
    },

    deitySummary: {
      about: String,
      blessings: [String],
    },

    preparation: preparationSchema,

    steps: {
      type: [stepSchema],
      default: [],
    },

    mantra: mantraSchema,

    spiritualMeaning: spiritualSchema,

    guidance: guidanceSchema,

    completion: completionSchema,

    blessings: {
      type: [String],
      default: [],
    },

    // 🔥 MEDIA
    media: {
      images: [String],
      audio: [String],
      videos: [String],
    },

    festivalIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Festival",
      },
    ],

    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"],
      default: "PENDING",
    },

    rating: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Pooja", poojaSchema);