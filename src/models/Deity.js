const mongoose = require("mongoose");

// 🔹 Common reusable schema
const titleDescSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { _id: false }
);

// 🔹 MAIN DEITY SCHEMA
const deitySchema = new mongoose.Schema(
  {
    // 🧾 BASIC INFO
    name: {
      type: String,
      required: true,
      trim: true,
    },

    alternate_names: {
      type: [String],
      default: [],
    },

    description: {
      type: String,
      default: "",
    },

    roles: {
      type: [String],
      default: [],
    },

    // 🧬 DIVINE STRUCTURE & LINEAGE
    structure: [titleDescSchema],

    // 🎨 APPEARANCE & SYMBOLISM
    appearance: [titleDescSchema],

    // 🧘 SPIRITUAL SIGNIFICANCE
    spiritual_significance: [titleDescSchema],

    // 🤝 CONNECTING WITH DEITY
    connecting: {
      how_to_pray: String,
      what_pleases: [String],
      displeases: [String],
    },

    // 🕉️ PRAYER & CHANTING
    chanting: {
      mantra: String,
      repetitions: String,
      benefits: [String],
      preferred_days: [String],
      associated_colors: [String],
    },

    // 🏠 HOME PRACTICE
    home_practice: {
      placement: String,
      offerings: [String],
      do_and_dont: {
        do: [String],
        dont: [String],
      },
    },
    devotional_experience: {
      sign_of_connection: String,
      notes: String,
    },

    // 📖 STORIES (VERY IMPORTANT)
    stories: [
      {
        title: String,
        description: String,
      },
    ],

    // 🔗 RELATED RITUALS
    rituals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pooja",
      },
    ],

    // 📦 MEDIA
    media: {
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
    },

    // 📊 STATUS
    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"],
      default: "PENDING",
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

module.exports = mongoose.model("Deity", deitySchema);