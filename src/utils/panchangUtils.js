const toRadians = (deg) => (deg * Math.PI) / 180;
const toDegrees = (rad) => (rad * 180) / Math.PI;

const normalizeDegrees = (deg) => ((deg % 360) + 360) % 360;

const TITHI_NAMES = [
  "Pratipada",
  "Dwitiya",
  "Tritiya",
  "Chaturthi",
  "Panchami",
  "Shashthi",
  "Saptami",
  "Ashtami",
  "Navami",
  "Dashami",
  "Ekadashi",
  "Dwadashi",
  "Trayodashi",
  "Chaturdashi",
];

const getJulianDate = (date) => date.getTime() / 86400000 + 2440587.5;

/** Approximate geocentric ecliptic longitude of the Sun (degrees). */
const getSunLongitude = (jd) => {
  const d = jd - 2451545.0;
  const g = toRadians(normalizeDegrees(357.529 + 0.98560028 * d));
  const q = toRadians(normalizeDegrees(280.459 + 0.98564736 * d));
  const L = q + toRadians(1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  return normalizeDegrees(toDegrees(L));
};

/** Approximate geocentric ecliptic longitude of the Moon (degrees). */
const getMoonLongitude = (jd) => {
  const d = jd - 2451545.0;
  const L = toRadians(normalizeDegrees(218.316 + 13.176396 * d));
  const M = toRadians(normalizeDegrees(134.963 + 13.064993 * d));
  let lon =
    L +
    toRadians(6.289 * Math.sin(M)) +
    toRadians(1.274 * Math.sin(2 * d - M)) +
    toRadians(0.658 * Math.sin(2 * d)) +
    toRadians(0.214 * Math.sin(2 * M)) +
    toRadians(0.11 * Math.sin(d));
  return normalizeDegrees(toDegrees(lon));
};

/** Hindu lunar day index 1–30 at the given instant. */
const getTithiNumber = (date) => {
  const jd = getJulianDate(date);
  const sun = getSunLongitude(jd);
  const moon = getMoonLongitude(jd);
  let diff = moon - sun;
  if (diff < 0) diff += 360;
  return Math.min(30, Math.floor(diff / 12) + 1);
};

const getTithiName = (tithiNumber) => {
  if (tithiNumber === 15) return "Purnima";
  if (tithiNumber === 30) return "Amavasya";
  const index = tithiNumber <= 15 ? tithiNumber : tithiNumber - 15;
  return TITHI_NAMES[index - 1] || "Unknown";
};

const formatOrdinalDay = (day) => {
  const n = Number(day);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
};

const formatTodayDate = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const month = parts.find((p) => p.type === "month")?.value;
  const year = parts.find((p) => p.type === "year")?.value;
  return `${formatOrdinalDay(day)} ${month}, ${year}`;
};

module.exports = {
  TITHI_NAMES,
  getTithiNumber,
  getTithiName,
  formatTodayDate,
};
