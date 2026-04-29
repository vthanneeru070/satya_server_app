const moment = require("moment-timezone");
const MoonEvent = require("../models/MoonEvent");
const HttpError = require("../utils/httpError");

const getMoonPhasesForMonth = async (year, month, timezone = "UTC") => {
  if (!moment.tz.zone(timezone)) {
    throw new HttpError("Invalid timezone. Use a valid IANA timezone", 400);
  }

  // Build month window in user timezone, then convert to UTC for DB query.
  const monthStartLocal = moment.tz(
    { year: Number(year), month: Number(month) - 1, day: 1, hour: 0, minute: 0, second: 0 },
    timezone
  );
  const nextMonthStartLocal = monthStartLocal.clone().add(1, "month");

  const monthStartUtc = monthStartLocal.clone().utc().toDate();
  const nextMonthStartUtc = nextMonthStartLocal.clone().utc().toDate();

  const moonEvents = await MoonEvent.find({
    eventTimeUtc: { $gte: monthStartUtc, $lt: nextMonthStartUtc },
  })
    .sort({ eventTimeUtc: 1 })
    .select("type eventTimeUtc -_id");

  return moonEvents.map((event) => ({
    date: moment(event.eventTimeUtc).tz(timezone).format("YYYY-MM-DD"),
    type: event.type,
  }));
};

module.exports = {
  getMoonPhasesForMonth,
};
