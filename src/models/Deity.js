const mongoose = require("mongoose");

const sectionContentSchema = new mongoose.Schema(
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

const sectionTitleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      trim: true,
      required: true,
    },
    value: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      trim: true,
      required: true,
    },
    title: {
      type: sectionTitleSchema,
      required: true,
    },
    content: {
      type: [sectionContentSchema],
      default: [],
    },
  },
  { _id: false }
);

const mediaSchema = new mongoose.Schema(
  {
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
  { _id: false }
);

const deitySchema = new mongoose.Schema(
  {
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
      trim: true,
      default: "",
    },
    roles: {
      type: [String],
      default: [],
    },
    sections: {
      type: [sectionSchema],
      default: [],
    },
    rituals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pooja",
      },
    ],
    media: {
      type: mediaSchema,
      default: () => ({}),
    },
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