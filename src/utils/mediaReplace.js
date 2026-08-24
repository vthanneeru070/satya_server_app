const mergeUploadedMediaSlot = (current = [], incoming, uploaded = []) => {
  if (Array.isArray(uploaded) && uploaded.length > 0) {
    return uploaded;
  }
  if (incoming !== undefined) {
    return Array.isArray(incoming) ? incoming.filter(Boolean) : [];
  }
  return Array.isArray(current) ? current.filter(Boolean) : [];
};

const orphanedUrls = (previous = [], next = []) => {
  const keep = new Set((next || []).filter(Boolean));
  return (previous || []).filter((url) => url && !keep.has(url));
};

module.exports = {
  mergeUploadedMediaSlot,
  orphanedUrls,
};
