/**
 * FCM data payloads only accept string values.
 */
const toFcmData = (data = {}) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value == null ? "" : String(value),
    ])
  );

module.exports = { toFcmData };
