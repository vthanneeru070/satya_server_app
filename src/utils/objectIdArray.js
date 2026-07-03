const HttpError = require("./httpError");

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

const extractObjectId = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (OBJECT_ID_REGEX.test(trimmed)) return trimmed;

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return extractObjectId(JSON.parse(trimmed));
      } catch (_error) {
        // fall through to regex extraction
      }
    }

    const objectIdMatch = trimmed.match(/[a-fA-F0-9]{24}/);
    return objectIdMatch ? objectIdMatch[0] : null;
  }

  if (typeof value === "object") {
    if (value._id !== undefined && value._id !== null) {
      return extractObjectId(value._id);
    }
    if (value.id !== undefined && value.id !== null) {
      return extractObjectId(value.id);
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
