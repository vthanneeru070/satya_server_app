const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildTextSearchFilter = (fields, search) => {
  const term = String(search || "").trim();
  if (!term) {
    return {};
  }

  const safe = escapeRegex(term);
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: safe, $options: "i" },
    })),
  };
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
  buildTextSearchFilter,
  mergeSearchFilter,
};
