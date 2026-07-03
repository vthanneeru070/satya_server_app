const HttpError = require("./httpError");

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;
const MAX_EXTRACT_DEPTH = 6;

const isObjectId = (value) => {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (value._bsontype === "ObjectId") {
    return true;
  }

  if (value.constructor?.name === "ObjectId") {
    return true;
  }

  return (
    typeof value.toHexString === "function" &&
    typeof value.toString === "function" &&
    OBJECT_ID_REGEX.test(String(value))
  );
};

const extractObjectId = (value, depth = 0) => {
  if (value === undefined || value === null || value === "" || depth > MAX_EXTRACT_DEPTH) {
    return null;
  }

  if (isObjectId(value)) {
    const str = String(value);
    return OBJECT_ID_REGEX.test(str) ? str : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (OBJECT_ID_REGEX.test(trimmed)) return trimmed;

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return extractObjectId(JSON.parse(trimmed), depth + 1);
      } catch (_error) {
        // fall through to regex extraction
      }
    }

    const objectIdMatch = trimmed.match(/[a-fA-F0-9]{24}/);
    return objectIdMatch ? objectIdMatch[0] : null;
  }

  if (typeof value === "object") {
    if (value._id !== undefined && value._id !== null && value._id !== value) {
      const fromId = extractObjectId(value._id, depth + 1);
      if (fromId) return fromId;
    }

    if (
      value.id !== undefined &&
      value.id !== null &&
      value.id !== value &&
      !Buffer.isBuffer(value.id)
    ) {
      return extractObjectId(value.id, depth + 1);
    }
  }

  return null;
};

const parseStringArrayField = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmedValue);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [parsed];
    } catch (_error) {
      // Keep handling as plain string below
    }

    if (trimmedValue.includes(",")) {
      return trimmedValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [trimmedValue];
  }

  if (typeof value === "object" && value !== null) {
    return [value];
  }

  throw new HttpError(`${fieldName} must be an array or JSON array string`, 400);
};

const normalizeObjectIdArray = (value) => {
  if (value === undefined || value === null) {
    return [];
  }

  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => extractObjectId(item)).filter(Boolean);
};

const parseObjectIdArrayField = (value, fieldName) => {
  const parsed = parseStringArrayField(value, fieldName);
  if (parsed === undefined) {
    return undefined;
  }

  const ids = normalizeObjectIdArray(parsed);
  if (parsed.length > 0 && ids.length !== parsed.length) {
    throw new HttpError(`${fieldName} must contain valid ObjectId values`, 400);
  }

  return ids;
};

module.exports = {
  OBJECT_ID_REGEX,
  extractObjectId,
  normalizeObjectIdArray,
  parseStringArrayField,
  parseObjectIdArrayField,
};
