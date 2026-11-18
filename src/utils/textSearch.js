const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Split a search string into keywords (whitespace-separated tokens).
 * Drops empty / 1-char tokens so noise like "a" does not match everything.
 */
const tokenizeKeywords = (search) => {
  const seen = new Set();
  const keywords = [];

  for (const raw of String(search || "").trim().split(/\s+/)) {
    const token = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (token.length < 2) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(token);
  }

  return keywords;
};

/**
 * Match if ANY keyword appears in ANY of the given fields (case-insensitive).
 * Example: "Ganesh chaturti puja" matches titles containing only "Ganesh".
 */
const buildTextSearchFilter = (fields, search) => {
  const keywords = tokenizeKeywords(search);
  if (!keywords.length) {
    return {};
  }

  const orClauses = [];
  for (const keyword of keywords) {
    const safe = escapeRegex(keyword);
    for (const field of fields) {
      orClauses.push({
        [field]: { $regex: safe, $options: "i" },
      });
    }
  }

  return { $or: orClauses };
};

const mergeSearchFilter = (filter, fields, search) => {
  const searchFilter = buildTextSearchFilter(fields, search);
  if (searchFilter.$or) {
    Object.assign(filter, searchFilter);
  }
  return filter;
};

module.exports = {
  escapeRegex,
  tokenizeKeywords,
  buildTextSearchFilter,
  mergeSearchFilter,
};
