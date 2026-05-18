const { sendSuccess } = require("../utils/response");
const { globalSearch, SEARCH_TYPES } = require("../services/globalSearchService");

const parseTypes = (raw) => {
  if (!raw) return SEARCH_TYPES;
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim().toLowerCase());
  return String(raw)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
};

const search = async (req, res, next) => {
  try {
    const data = await globalSearch({
      q: req.query.q,
      types: parseTypes(req.query.types),
      limitPerType: req.query.limit,
      maxTotal: req.query.maxTotal,
    });
    return sendSuccess(res, data, "Search results fetched successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  search,
};
