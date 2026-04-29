const extractMoonEvents = (data) => {
  const rows = Array.isArray(data) ? data : [];
  if (rows.length < 3) {
    return [];
  }

  const parsedRows = rows
    .map((item) => {
      const phase = Number(item?.phase);
      const eventTimeUtc = new Date(item?.time);
      if (Number.isNaN(phase) || Number.isNaN(eventTimeUtc.getTime())) {
        return null;
      }
      return { phase, eventTimeUtc };
    })
    .filter(Boolean);

  if (parsedRows.length < 3) {
    return [];
  }

  const events = [];
  const seenKeys = new Set();
  let index = 1;

  // Detect local minima/maxima including flat peaks/valleys by checking plateau edges.
  while (index < parsedRows.length - 1) {
    const runStart = index;
    const runPhase = parsedRows[index].phase;
    let runEnd = index;

    while (runEnd + 1 < parsedRows.length - 1 && parsedRows[runEnd + 1].phase === runPhase) {
      runEnd += 1;
    }

    const prevPhase = parsedRows[runStart - 1].phase;
    const nextPhase = parsedRows[runEnd + 1].phase;
    const middleIndex = Math.floor((runStart + runEnd) / 2);
    const eventTimeUtc = parsedRows[middleIndex].eventTimeUtc;

    if (runPhase < prevPhase && runPhase < nextPhase) {
      const key = `NEW_MOON:${eventTimeUtc.toISOString()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        events.push({ type: "NEW_MOON", eventTimeUtc });
      }
    } else if (runPhase > prevPhase && runPhase > nextPhase) {
      const key = `FULL_MOON:${eventTimeUtc.toISOString()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        events.push({ type: "FULL_MOON", eventTimeUtc });
      }
    }

    index = runEnd + 1;
  }

  return events;
};

module.exports = {
  extractMoonEvents,
};
