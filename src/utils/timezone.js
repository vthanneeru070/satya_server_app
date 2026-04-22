const HttpError = require("../utils/httpError");

const DEFAULT_TIMEZONE = "UTC";

const getValidTimeZone = (input) => {
  const timezone = String(input || "").trim();
  if (!timezone) {
    return DEFAULT_TIMEZONE;
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch (_error) {
    throw new HttpError("Invalid timezone. Use a valid IANA timezone", 400);
  }
};

const extractTimeZoneFromRequest = (req) =>
  getValidTimeZone(req.query?.timezone || req.headers["x-timezone"]);

const getDatePartsInTimeZone = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const parts = formatter.formatToParts(date);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const year = Number(parts.find((part) => part.type === "year")?.value);

  return { day, month, year };
};

const getDdMmYyyyInTimeZone = (date, timeZone) => {
  const { day, month, year } = getDatePartsInTimeZone(date, timeZone);
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
};

const getTimeZoneOffsetMs = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);

  const asUtcTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtcTimestamp - date.getTime();
};

const zonedDateTimeToUtc = ({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
};

const getTodayUtcRangeForTimeZone = (timeZone) => {
  const now = new Date();
  const { day, month, year } = getDatePartsInTimeZone(now, timeZone);

  const startUtc = zonedDateTimeToUtc({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);
  const nextDayStartUtc = zonedDateTimeToUtc(
    { year, month, day: day + 1, hour: 0, minute: 0, second: 0 },
    timeZone
  );

  return { startUtc, nextDayStartUtc };
};

const getMonthUtcRangeForTimeZone = (year, month, timeZone) => {
  const monthStartUtc = zonedDateTimeToUtc(
    { year, month, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone
  );
  const nextMonthStartUtc = zonedDateTimeToUtc(
    { year, month: month + 1, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone
  );

  return { monthStartUtc, nextMonthStartUtc };
};

module.exports = {
  DEFAULT_TIMEZONE,
  getValidTimeZone,
  extractTimeZoneFromRequest,
  getDdMmYyyyInTimeZone,
  getTodayUtcRangeForTimeZone,
  getMonthUtcRangeForTimeZone,
};
