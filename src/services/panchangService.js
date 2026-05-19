const moment = require("moment-timezone");
const { formatTodayDate, getTithiNumber, getTithiName } = require("../utils/panchangUtils");

/**
 * Panchang summary for "today" in the given IANA timezone.
 * Tithi is computed at local noon so it stays stable through the calendar day.
 */
const getTodayPanchang = (timeZone = "Asia/Kolkata") => {
  const localNoon = moment.tz(timeZone).hour(12).minute(0).second(0).millisecond(0);
  const instant = localNoon.toDate();

  const todayDate = formatTodayDate(instant, timeZone);
  const todayTithi = getTithiName(getTithiNumber(instant));

  return {
    todayDate,
    todayTithi,
    todayDateAndTithi: `${todayDate} | ${todayTithi}`,
    timezone: timeZone,
  };
};

module.exports = {
  getTodayPanchang,
};
