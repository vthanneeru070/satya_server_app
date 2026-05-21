const mongoose = require("mongoose");

const notificationPreferencesSchema = new mongoose.Schema(
  {
    festivalAlerts: { type: Boolean, default: true },
    poojaReminders: { type: Boolean, default: true },
    moonPhaseAlerts: { type: Boolean, default: true },
    dailyWisdom: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────
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
    fullName: { type: String, trim: true, default: null },
    firstName: { type: String, trim: true, default: null },
    lastName: { type: String, trim: true, default: null },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
      default: null,
    },
    dateOfBirth: { type: Date, default: null },
    /** Local time of birth, 24h `HH:mm` (e.g. `14:30`). */
    timeOfBirth: { type: String, trim: true, default: null },
    /** City / town of birth (e.g. `Hyderabad`). */
    placeOfBirth: { type: String, trim: true, default: null },
    /** Dial code including `+` (e.g. `+27`, `+91`). */
    countryCode: { type: String, trim: true, default: null },
    /** OAuth avatar (Google / Apple). */
    photoUrl: { type: String, default: null },
    /** User-uploaded profile photo (S3). */
    profileImageUrl: { type: String, default: null },
    emailVerified: { type: Boolean, default: false },
    /**
     * Mobile onboarding: `true` after user completes registration
     * (basic details + profile image).
     */
    isRegistered: { type: Boolean, default: false, index: true },

    // ── Auth provider / linking ───────────────────────────────────────────
    // Users may sign in with: google, apple, password.
    // Admins/SuperAdmins are restricted to: password (enforced in /auth/admin-login).
    provider: {
      type: String,
      enum: ["google", "apple", "password"],
      required: true,
    },
    linkedProviders: {
      type: [String],
      enum: ["google", "apple", "password"],
      default: [],
    },

    // ── Authorization ─────────────────────────────────────────────────────
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },
    // Hard gate for admin panel access. Normal users cannot have this set.
    canLoginAdminPanel: {
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

    // ── App preferences ───────────────────────────────────────────────────
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    /** Legacy flat list — kept in sync with `fcmDevices` for push multicast. */
    fcmTokens: {
      type: [String],
      default: [],
    },
    /**
     * Registered FCM devices (mobile + Flutter web admin tabs).
     * Multiple entries per user are expected (phone + laptop + browser tabs).
     */
    fcmDevices: {
      type: [
        {
          token: { type: String, required: true, trim: true },
          platform: {
            type: String,
            enum: ["android", "ios", "web", null],
            default: null,
          },
          deviceId: { type: String, trim: true, default: null },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({}),
    },
    preferredLanguage: {
      type: String,
      enum: ["en", "te", "ta", "hi", "kn"],
      default: "en",
    },
    /** Deities the user marked as favourite (mobile app). */
    favoriteDeities: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Deity",
        },
      ],
      default: [],
    },
    streakCount: {
      type: Number,
      default: 0,
    },
    lastSyncAt: {
      type: Date,
      default: null,
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });
userSchema.index({ email: 1 });
userSchema.index({ linkedProviders: 1 });
userSchema.index({ fcmTokens: 1 });
userSchema.index({ canLoginAdminPanel: 1 });
userSchema.index({ isDeleted: 1 });

module.exports = mongoose.model("User", userSchema);
