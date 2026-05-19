const GENDER_VALUES = ["male", "female", "other", "prefer_not_to_say"];

const ZODIAC_SIGN_VALUES = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

const toTrimmedOrNull = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeGender = (value) => {
  const raw = toTrimmedOrNull(value);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (GENDER_VALUES.includes(lower)) return lower;
  return null;
};

const normalizeCountryCode = (value) => {
  const raw = toTrimmedOrNull(value);
  if (!raw) return null;
  const withPlus = raw.startsWith("+") ? raw : `+${raw}`;
  return /^\+\d{1,4}$/.test(withPlus) ? withPlus : null;
};

const normalizePhone = (value) => {
  const raw = toTrimmedOrNull(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15 ? digits : null;
};

const normalizeTimeOfBirth = (value) => {
  const raw = toTrimmedOrNull(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const parseDateOfBirth = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date > new Date()) return null;
  return date;
};

const normalizePlaceOfBirth = (value) => {
  const raw = toTrimmedOrNull(value);
  if (!raw || raw.length < 2 || raw.length > 120) return null;
  return raw;
};

const normalizeZodiacSign = (value) => {
  const raw = toTrimmedOrNull(value);
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/\s+/g, "_");
  const aliases = {
    aries: "aries",
    taurus: "taurus",
    gemini: "gemini",
    cancer: "cancer",
    leo: "leo",
    virgo: "virgo",
    libra: "libra",
    scorpio: "scorpio",
    sagittarius: "sagittarius",
    saggitarius: "sagittarius",
    capricorn: "capricorn",
    aquarius: "aquarius",
    pisces: "pisces",
    mesh: "aries",
    mesha: "aries",
    vrishabha: "taurus",
    mithuna: "gemini",
    karka: "cancer",
    simha: "leo",
    kanya: "virgo",
    tula: "libra",
    vrischika: "scorpio",
    dhanu: "sagittarius",
    makara: "capricorn",
    kumbha: "aquarius",
    meena: "pisces",
  };
  if (ZODIAC_SIGN_VALUES.includes(lower)) return lower;
  return aliases[lower] || null;
};

const hasProfileImage = (user) =>
  Boolean(toTrimmedOrNull(user?.profileImageUrl) || toTrimmedOrNull(user?.photoUrl));

/** All mobile basic-details fields + a profile image are present. */
const isProfileComplete = (user) => {
  if (!user) return false;
  return Boolean(
    toTrimmedOrNull(user.fullName) &&
      normalizeGender(user.gender) &&
      user.dateOfBirth &&
      normalizeTimeOfBirth(user.timeOfBirth) &&
      normalizePlaceOfBirth(user.placeOfBirth) &&
      normalizeCountryCode(user.countryCode) &&
      normalizePhone(user.phone) &&
      hasProfileImage(user)
  );
};

const attachIsRegistered = (userDoc) => {
  const plain = userDoc?.toObject ? userDoc.toObject({ virtuals: true }) : { ...userDoc };
  const registered = isProfileComplete(plain);
  return {
    ...plain,
    isRegistered: registered,
    imageUrl: toTrimmedOrNull(plain.profileImageUrl) || toTrimmedOrNull(plain.photoUrl) || null,
  };
};

module.exports = {
  GENDER_VALUES,
  ZODIAC_SIGN_VALUES,
  toTrimmedOrNull,
  normalizeGender,
  normalizeCountryCode,
  normalizePhone,
  normalizeTimeOfBirth,
  parseDateOfBirth,
  normalizePlaceOfBirth,
  normalizeZodiacSign,
  hasProfileImage,
  isProfileComplete,
  attachIsRegistered,
};
