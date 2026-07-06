const Festival = require("../models/Festival");
const Pooja = require("../models/Pooja");
const { sendSuccess } = require("../utils/response");
const { buildScheduledOrDailyPoojaFilter } = require("../utils/poojaDaily");
const {
  getValidTimeZone,
  getMonthUtcRangeForTimeZone,
} = require("../utils/timezone");
const { getMoonPhasesForMonth } = require("../services/moonService");

const getCalendarItems = async (req, res, next) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const timezone = getValidTimeZone(req.headers["x-timezone"] || "UTC");
    const { monthStartUtc, nextMonthStartUtc } = getMonthUtcRangeForTimeZone(
      year,
      month,
      timezone
    );

    const isAdminUser = req.user?.role === "admin";

    const festivalFilter = {
      date: { $gte: monthStartUtc, $lt: nextMonthStartUtc },
      isDeleted: false,
    };
    if (!isAdminUser) {
      festivalFilter.status = "APPROVED";
      festivalFilter.isVisible = true;
    }

    const poojaFilter = buildScheduledOrDailyPoojaFilter({
      monthStartUtc,
      nextMonthStartUtc,
    });
    if (!isAdminUser) {
      poojaFilter.status = "APPROVED";
    }

    const [festivals, poojas, moonPhases] = await Promise.all([
      Festival.find(festivalFilter).sort({ date: 1 }).populate("createdBy", "email role"),
      Pooja.find(poojaFilter)
        .sort({ daily: -1, "schedules.date": 1 })
        .populate("createdBy", "email role")
        .populate("deity", "name deity_color"),
      getMoonPhasesForMonth(year, month, timezone),
    ]);

    return sendSuccess(
      res,
      {
        month,
        year,
        timezone,
        festivals,
        poojas,
        moonPhases,
      },
      "Calendar data fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getCalendarItems,
};
