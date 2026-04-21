const DailySloka = require("../models/DailySloka");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");

const toDateParts = (dateString) => {
  const match = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-([0-9]{4})$/.exec(
    String(dateString || "").trim()
  );

  if (!match) {
    throw new HttpError("date must be in dd-mm-yyyy format", 400);
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return { day, month, year };
};

const toDateKey = ({ day, month, year }) => {
  const d = String(day).padStart(2, "0");
  const m = String(month).padStart(2, "0");
  const y = String(year);
  return `${d}-${m}-${y}`;
};

const todayDateKey = () => {
  const now = new Date();
  return toDateKey({
    day: now.getUTCDate(),
    month: now.getUTCMonth() + 1,
    year: now.getUTCFullYear(),
  });
};

const createDailySloka = async (req, res, next) => {
  try {
    const { sloka, date } = req.body;
    const parts = toDateParts(date);
    const dateKey = toDateKey(parts);
    const normalizedDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

    const dailySloka = await DailySloka.findOneAndUpdate(
      { dateKey },
      {
        sloka,
        date: normalizedDate,
        dateKey,
        createdBy: req.user.userId,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(res, { dailySloka }, "Daily sloka saved successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getDailySloka = async (req, res, next) => {
  try {
    const dateKey = req.query.date ? toDateKey(toDateParts(req.query.date)) : todayDateKey();

    const dailySloka = await DailySloka.findOne({ dateKey }).populate(
      "createdBy",
      "email role"
    );

    return sendSuccess(
      res,
      { dailySloka, date: dateKey },
      dailySloka ? "Daily sloka fetched successfully" : "No daily sloka found for this date"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createDailySloka,
  getDailySloka,
};
