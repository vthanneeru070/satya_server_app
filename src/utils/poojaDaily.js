const DAILY_POOJA_CATEGORY = "daily puja";

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return undefined;
};

const isDailyPoojaCategory = (category) =>
  String(category || "").trim().toLowerCase() === DAILY_POOJA_CATEGORY;

const resolveDailyFlag = ({ daily, category, fallback = false }) => {
  const explicitDaily = normalizeBoolean(daily);
  if (explicitDaily !== undefined) {
    return explicitDaily;
  }

  if (category !== undefined) {
    return isDailyPoojaCategory(category);
  }

  return fallback;
};

const buildScheduledOrDailyPoojaFilter = ({ monthStartUtc, nextMonthStartUtc } = {}) => {
  const clauses = [{ daily: true }];

  if (monthStartUtc && nextMonthStartUtc) {
    clauses.unshift({
      "schedules.date": { $gte: monthStartUtc, $lt: nextMonthStartUtc },
    });
  }

  return { $or: clauses };
};

module.exports = {
  DAILY_POOJA_CATEGORY,
  normalizeBoolean,
  isDailyPoojaCategory,
  resolveDailyFlag,
  buildScheduledOrDailyPoojaFilter,
};
