const Pooja = require("../models/Pooja");
const Festival = require("../models/Festival");
const Ritual = require("../models/Ritual");
const Deity = require("../models/Deity");
const Donation = require("../models/Donation");

const SEARCH_TYPES = ["pooja", "festival", "ritual", "deity", "donation"];

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const trimDescription = (text, max = 160) => {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1)}…`;
};

const firstImage = (...candidates) => {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (Array.isArray(c) && c.length && c[0]) return c[0];
  }
  return null;
};

const mapHit = ({ id, type, title, name, description, imageUrl, updatedAt }) => ({
  id: String(id),
  type,
  title: title || name || "",
  name: name || title || "",
  description: trimDescription(description),
  imageUrl: imageUrl || null,
  updatedAt,
});

const buildTextFilter = (fields, query) => {
  const safe = escapeRegex(query);
  if (!safe) return null;
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: safe, $options: "i" },
    })),
  };
};

const searchPoojas = async (query, limit) => {
  const text = buildTextFilter(["title", "description", "category"], query);
  const filter = { status: "APPROVED", ...(text || {}) };

  const rows = await Pooja.find(filter)
    .select("title description category media updatedAt")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  return rows.map((row) =>
    mapHit({
      id: row._id,
      type: "pooja",
      title: row.title,
      description: row.description,
      imageUrl: firstImage(row.media?.images),
      updatedAt: row.updatedAt,
    })
  );
};

const searchFestivals = async (query, limit) => {
  const text = buildTextFilter(["title", "description", "category"], query);
  const filter = {
    status: "APPROVED",
    isVisible: true,
    isDeleted: { $ne: true },
    ...(text || {}),
  };

  const rows = await Festival.find(filter)
    .select("title description image updatedAt")
    .sort({ date: -1 })
    .limit(limit)
    .lean();

  return rows.map((row) =>
    mapHit({
      id: row._id,
      type: "festival",
      title: row.title,
      description: row.description,
      imageUrl: row.image,
      updatedAt: row.updatedAt,
    })
  );
};

const searchRituals = async (query, limit) => {
  const text = buildTextFilter(["title", "description", "category", "purpose"], query);
  const filter = {
    status: "APPROVED",
    isDeleted: { $ne: true },
    ...(text || {}),
  };

  const rows = await Ritual.find(filter)
    .select("title description images updatedAt")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  return rows.map((row) =>
    mapHit({
      id: row._id,
      type: "ritual",
      title: row.title,
      description: row.description,
      imageUrl: firstImage(row.images),
      updatedAt: row.updatedAt,
    })
  );
};

const searchDeities = async (query, limit) => {
  const safe = escapeRegex(query);
  const text = safe
    ? {
        $or: [
          { name: { $regex: safe, $options: "i" } },
          { description: { $regex: safe, $options: "i" } },
          { alternate_names: { $regex: safe, $options: "i" } },
          { roles: { $regex: safe, $options: "i" } },
        ],
      }
    : null;

  const filter = { status: "APPROVED", ...(text || {}) };

  const rows = await Deity.find(filter)
    .select("name description media updatedAt")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  return rows.map((row) =>
    mapHit({
      id: row._id,
      type: "deity",
      name: row.name,
      title: row.name,
      description: row.description,
      imageUrl: firstImage(row.media?.images),
      updatedAt: row.updatedAt,
    })
  );
};

const searchDonations = async (query, limit) => {
  const text = buildTextFilter(["title", "description"], query);
  const filter = {
    status: "APPROVED",
    isVisible: true,
    ...(text || {}),
  };

  const rows = await Donation.find(filter)
    .select("title description image updatedAt")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  return rows.map((row) =>
    mapHit({
      id: row._id,
      type: "donation",
      title: row.title,
      description: row.description,
      imageUrl: row.image,
      updatedAt: row.updatedAt,
    })
  );
};

const rankResults = (results, query) => {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return results;

  const score = (item) => {
    const title = (item.title || item.name || "").toLowerCase();
    if (title === q) return 100;
    if (title.startsWith(q)) return 80;
    if (title.includes(q)) return 60;
    if ((item.description || "").toLowerCase().includes(q)) return 40;
    return 10;
  };

  return [...results].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
};

const globalSearch = async ({ q, types, limitPerType, maxTotal }) => {
  const query = String(q || "").trim();
  if (query.length < 2) {
    return {
      query,
      total: 0,
      results: [],
      countsByType: Object.fromEntries(SEARCH_TYPES.map((t) => [t, 0])),
    };
  }

  const normalizedTypes = (types?.length ? types : SEARCH_TYPES).filter((t) =>
    SEARCH_TYPES.includes(t)
  );

  const perTypeLimit = Math.min(Math.max(Number(limitPerType) || 10, 1), 25);
  const cap = Math.min(Math.max(Number(maxTotal) || 50, 1), 100);

  const runners = {
    pooja: () => searchPoojas(query, perTypeLimit),
    festival: () => searchFestivals(query, perTypeLimit),
    ritual: () => searchRituals(query, perTypeLimit),
    deity: () => searchDeities(query, perTypeLimit),
    donation: () => searchDonations(query, perTypeLimit),
  };

  const entries = await Promise.all(
    normalizedTypes.map(async (type) => {
      const items = await runners[type]();
      return [type, items];
    })
  );

  const countsByType = Object.fromEntries(SEARCH_TYPES.map((t) => [t, 0]));
  const buckets = {};
  for (const [type, items] of entries) {
    buckets[type] = items;
    countsByType[type] = items.length;
  }

  const merged = rankResults(
    entries.flatMap(([, items]) => items),
    query
  ).slice(0, cap);

  return {
    query,
    total: merged.length,
    results: merged,
    countsByType,
    byType: buckets,
  };
};

module.exports = {
  SEARCH_TYPES,
  globalSearch,
};
