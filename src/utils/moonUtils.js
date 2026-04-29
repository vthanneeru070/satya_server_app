const NEW_MOON_THRESHOLD = 0.02;
const FULL_MOON_TARGET = 0.5;
const FULL_MOON_THRESHOLD = 0.02;

const extractMoonEvents = (data) => {
  const rows = Array.isArray(data) ? data : [];

  return rows
    .map((item) => {
      const phase = Number(item?.phase);
      const eventTimeUtc = new Date(item?.time);

      if (Number.isNaN(phase) || Number.isNaN(eventTimeUtc.getTime())) {
        return null;
      }

      if (phase < NEW_MOON_THRESHOLD) {
        return { type: "NEW_MOON", eventTimeUtc };
      }

      if (Math.abs(phase - FULL_MOON_TARGET) < FULL_MOON_THRESHOLD) {
        return { type: "FULL_MOON", eventTimeUtc };
      }

      return null;
    })
    .filter(Boolean);
};

module.exports = {
  extractMoonEvents,
};
