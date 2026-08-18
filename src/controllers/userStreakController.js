const { sendSuccess } = require("../utils/response");
const HttpError = require("../utils/httpError");
const userStreakService = require("../services/userStreakService");
const { getValidTimeZone } = require("../utils/timezone");

const resolveTimeZone = (req) => {
  const raw = String(
    req.headers["x-timezone"] || req.headers["timezone"] || req.query?.timezone || ""
  ).trim();
  return raw ? getValidTimeZone(raw) : undefined;
};

/** Call when the app opens (or resumes) — maintains consecutive-day streak. */
const recordAppOpen = async (req, res, next) => {
  try {
    const streak = await userStreakService.recordDailyAppOpen(req.user.userId, {
      timeZone: resolveTimeZone(req),
    });
    if (!streak) {
      throw new HttpError("Daily streak is only available for mobile app users", 403);
    }
    const message = streak.recordedToday
      ? streak.streakIncreased
        ? `Streak increased to ${streak.streakCount} days`
        : streak.streakReset
          ? "Streak restarted at 1 day"
          : "First day streak started"
      : "Streak already recorded for today";
    return sendSuccess(res, { streak }, message);
  } catch (error) {
    return next(error);
  }
};

const getStreak = async (req, res, next) => {
  try {
    const streak = await userStreakService.getStreakStatus(req.user.userId, {
      timeZone: resolveTimeZone(req),
    });
    return sendSuccess(res, { streak }, "Streak status fetched");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  recordAppOpen,
  getStreak,
};
