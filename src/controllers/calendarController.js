const Festival = require("../models/Festival");
const Pooja = require("../models/Pooja");
const { sendSuccess } = require("../utils/response");
const {
  extractTimeZoneFromRequest,
  getMonthUtcRangeForTimeZone,
} = require("../utils/timezone");

const getCalendarItems = async (req, res, next) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const timezone = extractTimeZoneFromRequest(req);
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

    const poojaFilter = {
      createdAt: { $gte: monthStartUtc, $lt: nextMonthStartUtc },
    };
    if (!isAdminUser) {
      poojaFilter.status = "APPROVED";
    }

    const [festivals, poojas] = await Promise.all([
      Festival.find(festivalFilter).sort({ date: 1 }).populate("createdBy", "email role"),
      Pooja.find(poojaFilter).sort({ createdAt: 1 }).populate("createdBy", "email role"),
    ]);

    return sendSuccess(
      res,
      {
        month,
        year,
        timezone,
        festivals,
        poojas,
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
