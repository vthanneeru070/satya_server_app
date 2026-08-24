const HttpError = require("../utils/httpError");

const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_APP_TIMEZONE = "Africa/Johannesburg";

const TIMEZONE_ALIASES = {
  SAST: "Africa/Johannesburg",
  CAT: "Africa/Johannesburg",
  IST: "Asia/Kolkata",
  UTC: "UTC",
  GMT: "UTC",
  "INDIA STANDARD TIME": "Asia/Kolkata",
  "SOUTH AFRICA STANDARD TIME": "Africa/Johannesburg",
  "SOUTH AFRICA STANDARD TIME SAST": "Africa/Johannesburg",
};

const isValidIanaTimeZone = (timezone) => {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch (_error) {
    return false;
  }
};

const normalizeTimeZoneId = (input) => {
  const timezone = String(input || "").trim();
  if (!timezone) {
    return "";
  }

  const aliased = TIMEZONE_ALIASES[timezone.toUpperCase()];
  if (aliased) {
    return aliased;
  }

  const gmtOffset = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(timezone);
  if (gmtOffset) {
    const hours = Number(gmtOffset[2]);
    const minutes = Number(gmtOffset[3] || "0");
    if (gmtOffset[1] === "+" && hours === 2 && minutes === 0) {
      return "Africa/Johannesburg";
    }
    if (gmtOffset[1] === "+" && hours === 5 && minutes === 30) {
      return "Asia/Kolkata";
    }
  }

  return timezone;
};

const getValidTimeZone = (input) => {
  const timezone = normalizeTimeZoneId(input);
  if (!timezone) {
    return DEFAULT_TIMEZONE;
  }

  if (isValidIanaTimeZone(timezone)) {
    return timezone;
  }

  throw new HttpError("Invalid timezone. Use a valid IANA timezone", 400);
};

const readTimeZoneFromRequest = (req) =>
  String(
    req.headers["x-timezone"] || req.headers["timezone"] || req.query?.timezone || ""
  ).trim();

const extractTimeZoneFromRequest = (req) => getValidTimeZone(readTimeZoneFromRequest(req));

const resolveRequestTimeZone = (req, fallback = DEFAULT_APP_TIMEZONE) => {
  const normalized = normalizeTimeZoneId(readTimeZoneFromRequest(req));
  if (normalized && isValidIanaTimeZone(normalized)) {
    return normalized;
  }
  return fallback;
};

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

/** `YYYY-MM-DD` in the given IANA timezone (for daily streak keys). */
const getIsoDateKeyInTimeZone = (date, timeZone) => {
  const { day, month, year } = getDatePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** Previous calendar day key relative to `isoDateKey` in `timeZone`. */
const getPreviousIsoDateKey = (isoDateKey, timeZone) => {
  const [year, month, day] = String(isoDateKey).split("-").map(Number);
  const noonUtc = zonedDateTimeToUtc({ year, month, day, hour: 12, minute: 0, second: 0 }, timeZone);
  const prev = new Date(noonUtc.getTime() - 24 * 60 * 60 * 1000);
  return getIsoDateKeyInTimeZone(prev, timeZone);
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

/**
 * Date-only fields (pooja schedules, festivals, daily sloka) are stored as
 * UTC midnight of the calendar day. Compare them to the user's local Y-M-D
 * as UTC midnight, not to zoned local-midnight instants.
 */
const getCalendarDayUtcRangeForTimeZone = (timeZone, date = new Date()) => {
  const { day, month, year } = getDatePartsInTimeZone(date, timeZone);
  const startUtc = new Date(Date.UTC(year, month - 1, day));
  const nextDayStartUtc = new Date(Date.UTC(year, month - 1, day + 1));
  const dateKey = `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;

  return { startUtc, nextDayStartUtc, dateKey, day, month, year };
};

module.exports = {
  DEFAULT_TIMEZONE,
  DEFAULT_APP_TIMEZONE,
  getValidTimeZone,
  extractTimeZoneFromRequest,
  resolveRequestTimeZone,
  getDdMmYyyyInTimeZone,
  getIsoDateKeyInTimeZone,
  getPreviousIsoDateKey,
  getTodayUtcRangeForTimeZone,
  getMonthUtcRangeForTimeZone,
  getCalendarDayUtcRangeForTimeZone,
};
