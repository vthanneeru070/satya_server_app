const User = require("../models/User");
const HttpError = require("../utils/httpError");
const {
  getValidTimeZone,
  getIsoDateKeyInTimeZone,
  getPreviousIsoDateKey,
} = require("../utils/timezone");

const DEFAULT_STREAK_TIMEZONE = "Asia/Kolkata";

const resolveTimeZone = (user, override) =>
  getValidTimeZone(override || user?.timezone || DEFAULT_STREAK_TIMEZONE);

const buildStreakView = (user, timeZone) => {
  const todayKey = getIsoDateKeyInTimeZone(new Date(), timeZone);
  const lastKey = user.streakLastDateKey || null;
  return {
    streakCount: user.streakCount || 0,
    streakLastDateKey: lastKey,
    todayDateKey: todayKey,
    activeToday: lastKey === todayKey,
    timezone: timeZone,
  };
};

/**
 * Record one app-open for today (idempotent per calendar day in user timezone).
 * - Same day again → no change
 * - Yesterday was last → streak + 1
 * - Gap or first open → streak = 1
 */
const recordDailyAppOpen = async (userId, { timeZone: timeZoneOverride } = {}) => {
  const user = await User.findOne({
    _id: userId,
    role: "user",
    isDeleted: { $ne: true },
  });

  if (!user) {
    return null;
  }

  const timeZone = resolveTimeZone(user, timeZoneOverride);
  const todayKey = getIsoDateKeyInTimeZone(new Date(), timeZone);
  const previousKey = user.streakLastDateKey;

  if (previousKey === todayKey) {
    return {
      ...buildStreakView(user, timeZone),
      recordedToday: false,
      streakIncreased: false,
      streakReset: false,
    };
  }

  const yesterdayKey = getPreviousIsoDateKey(todayKey, timeZone);
  const prevCount = user.streakCount || 0;
  let nextCount = 1;
  let streakIncreased = false;
  let streakReset = false;

  if (previousKey === yesterdayKey) {
    nextCount = prevCount + 1;
    streakIncreased = true;
  } else if (previousKey) {
    nextCount = 1;
    streakReset = true;
  } else {
    nextCount = 1;
  }

  user.streakCount = nextCount;
  user.streakLastDateKey = todayKey;
  user.lastSyncAt = new Date();
  user.lastActiveAt = new Date();
  await user.save();

  return {
    ...buildStreakView(user, timeZone),
    recordedToday: true,
    streakIncreased,
    streakReset,
  };
};

const getStreakStatus = async (userId, { timeZone: timeZoneOverride } = {}) => {
  const user = await User.findOne({
    _id: userId,
    role: "user",
    isDeleted: { $ne: true },
  }).select("streakCount streakLastDateKey timezone");

  if (!user) {
    throw new HttpError("User not found", 404);
  }

  const timeZone = resolveTimeZone(user, timeZoneOverride);
  return buildStreakView(user, timeZone);
};

module.exports = {
  recordDailyAppOpen,
  getStreakStatus,
  buildStreakView,
};
