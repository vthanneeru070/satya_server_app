const DailySloka = require("../models/DailySloka");
const Pooja = require("../models/Pooja");
const Festival = require("../models/Festival");
const Donation = require("../models/Donation");
const { sendSuccess } = require("../utils/response");
const {
  getValidTimeZone,
  getDdMmYyyyInTimeZone,
  getTodayUtcRangeForTimeZone,
} = require("../utils/timezone");
const { getTodayPanchang } = require("../services/panchangService");

const resolveTimeZone = (req) => {
  const tz = String(req.headers["x-timezone"] || req.query?.timezone || "").trim();
  return getValidTimeZone(tz || "Asia/Kolkata");
};

const getUserHome = async (req, res, next) => {
  try {
    const timezone = resolveTimeZone(req);
    const now = new Date();
    const { startUtc: todayStartUtc } = getTodayUtcRangeForTimeZone(timezone);
    const todayDateKey = getDdMmYyyyInTimeZone(now, timezone);
    const panchang = getTodayPanchang(timezone);

    const [dailySloka, poojas, festivals, donations] = await Promise.all([
      DailySloka.findOne({ dateKey: todayDateKey }).populate("createdBy", "email role"),
      Pooja.find({ status: "APPROVED" })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("createdBy", "email role"),
      Festival.find({
        date: { $gte: todayStartUtc },
        status: "APPROVED",
        isDeleted: false,
      })
        .sort({ date: 1 })
        .limit(5)
        .populate("createdBy", "email role"),
      Donation.find({ status: "APPROVED" })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("createdBy", "email role"),
    ]);

    return sendSuccess(
      res,
      {
        todayDate: panchang.todayDate,
        todayTithi: panchang.todayTithi,
        todayDateAndTithi: panchang.todayDateAndTithi,
        timezone,
        dailySloka,
        poojas,
        festivals,
        donations,
      },
      "User home data fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getUserHome,
};
