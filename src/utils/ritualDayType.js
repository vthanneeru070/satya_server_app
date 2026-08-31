const HttpError = require("./httpError");

const RITUAL_DAY_SINGLE = "1 day ritual";
const RITUAL_DAY_MULTIPLE = "Multiple days ritual";

/**
 * Canonical ritual duration type stored in `ritualDay`.
 * Legacy free-text values are mapped using days count when possible.
 */
const normalizeRitualDayType = (value, daysCount = 0) => {
  const trimmed = String(value ?? "").trim();
  const lower = trimmed.toLowerCase();

  if (lower === RITUAL_DAY_MULTIPLE.toLowerCase() || lower.includes("multiple")) {
    return RITUAL_DAY_MULTIPLE;
  }
  if (
    lower === RITUAL_DAY_SINGLE.toLowerCase() ||
    lower.includes("1 day") ||
    lower === "single"
  ) {
    return RITUAL_DAY_SINGLE;
  }
  if (daysCount > 1) return RITUAL_DAY_MULTIPLE;
  return RITUAL_DAY_SINGLE;
};

const isSingleDayRitualType = (value) =>
  normalizeRitualDayType(value) === RITUAL_DAY_SINGLE;

/**
 * Ensures `days` matches ritual type and returns canonical `ritualDay` label.
 */
const resolveRitualDaysForType = (ritualDayInput, days, normalizeDays) => {
  const normalizedDays = normalizeDays(days);
  if (!normalizedDays.length) {
    throw new HttpError("At least one ritual day is required", 400);
  }

  const ritualDay = normalizeRitualDayType(ritualDayInput, normalizedDays.length);

  if (isSingleDayRitualType(ritualDay) && normalizedDays.length > 1) {
    throw new HttpError(
      "A 1 day ritual can only include one day in the days array",
      400
    );
  }

  const resolvedDays =
    isSingleDayRitualType(ritualDay) ? [normalizedDays[0]] : normalizedDays;

  return { ritualDay, days: resolvedDays };
};

module.exports = {
  RITUAL_DAY_SINGLE,
  RITUAL_DAY_MULTIPLE,
  normalizeRitualDayType,
  isSingleDayRitualType,
  resolveRitualDaysForType,
};
