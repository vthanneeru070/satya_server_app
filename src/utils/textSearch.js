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

const buildFieldOrFilter = (fields, term) => {
  const safe = escapeRegex(term);
  if (!safe) return {};
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: safe, $options: "i" },
    })),
  };
};

/** Full query as one substring (phrase) across fields. */
const buildPhraseSearchFilter = (fields, search) => {
  const term = String(search || "").trim();
  if (!term) return {};
  return buildFieldOrFilter(fields, term);
};

/**
 * Match if ANY keyword appears in ANY of the given fields (case-insensitive).
 */
const buildKeywordSearchFilter = (fields, search) => {
  const keywords = tokenizeKeywords(search);
  if (!keywords.length) return {};

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

/**
 * Prefer exact phrase. If the whole query matches nothing, fall back to
 * keyword OR (first / second / third token, etc.).
 */
const resolveTextSearchFilter = async (Model, baseFilter, fields, search) => {
  const phrase = buildPhraseSearchFilter(fields, search);
  if (!phrase.$or) return {};

  const phraseHits = await Model.countDocuments({
    ...baseFilter,
    ...phrase,
  });
  if (phraseHits > 0) return phrase;

  const keywords = tokenizeKeywords(search);
  if (keywords.length <= 1) return phrase;

  return buildKeywordSearchFilter(fields, search);
};

/** @deprecated Prefer [resolveTextSearchFilter] / [mergeSearchFilterAsync]. Keyword-only. */
const buildTextSearchFilter = (fields, search) =>
  buildKeywordSearchFilter(fields, search);

/** Sync keyword-only merge (legacy). Prefer [mergeSearchFilterAsync]. */
const mergeSearchFilter = (filter, fields, search) => {
  const searchFilter = buildKeywordSearchFilter(fields, search);
  if (searchFilter.$or) {
    Object.assign(filter, searchFilter);
  }
  return filter;
};

/**
 * Mutates [filter] with phrase-first, then keyword fallback search.
 * [Model] is required so we can count phrase hits against [filter] as-is.
 */
const mergeSearchFilterAsync = async (Model, filter, fields, search) => {
  const searchFilter = await resolveTextSearchFilter(
    Model,
    filter,
    fields,
    search
  );
  if (searchFilter.$or) {
    Object.assign(filter, searchFilter);
  }
  return filter;
};

module.exports = {
  escapeRegex,
  tokenizeKeywords,
  buildPhraseSearchFilter,
  buildKeywordSearchFilter,
  buildTextSearchFilter,
  resolveTextSearchFilter,
  mergeSearchFilter,
  mergeSearchFilterAsync,
};
