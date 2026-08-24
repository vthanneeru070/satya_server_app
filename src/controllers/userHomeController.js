const DailySloka = require("../models/DailySloka");
const Pooja = require("../models/Pooja");
const Festival = require("../models/Festival");
const Donation = require("../models/Donation");
const { sendSuccess } = require("../utils/response");
const {
  resolveRequestTimeZone,
  getCalendarDayUtcRangeForTimeZone,
} = require("../utils/timezone");
const { buildScheduledOrDailyPoojaFilter } = require("../utils/poojaDaily");
const { getTodayPanchang } = require("../services/panchangService");

const populatePooja = (query) =>
  query.populate("createdBy", "email role").populate("deity", "name deity_color");

const getUserHome = async (req, res, next) => {
  try {
    const timezone = resolveRequestTimeZone(req);
    const { startUtc, nextDayStartUtc, dateKey: todayDateKey } =
      getCalendarDayUtcRangeForTimeZone(timezone);
    const panchang = getTodayPanchang(timezone);

    const poojaFilter = {
      status: "APPROVED",
      ...buildScheduledOrDailyPoojaFilter({ fromUtc: startUtc }),
    };

    const festivalFilter = {
      status: "APPROVED",
      isVisible: true,
      isDeleted: false,
      $or: [{ date: { $gte: startUtc } }, { endDate: { $gte: startUtc } }],
    };

    const [dailySloka, dailyPoojas, poojas, festivals, donations] = await Promise.all([
      DailySloka.findOne({
        $or: [
          { dateKey: todayDateKey },
          { date: { $gte: startUtc, $lt: nextDayStartUtc } },
        ],
      })
        .sort({ date: -1 })
        .populate("createdBy", "email role"),
      populatePooja(Pooja.find({ status: "APPROVED", daily: true }).sort({ createdAt: -1 })),
      populatePooja(
        Pooja.find(poojaFilter).sort({ daily: -1, "schedules.date": 1, createdAt: -1 }).limit(5)
      ),
      Festival.find(festivalFilter)
        .sort({ date: 1 })
        .limit(5)
        .populate("createdBy", "email role"),
      Donation.find({ status: "APPROVED", isVisible: true })
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
        todayDateKey,
        dailySloka,
        dailyPoojas,
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
