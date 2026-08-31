const { pushWithInbox } = require("./fcmOrderNotifyService");

const formatRequiredItemsBody = (items = []) => {
  const list = items.filter(Boolean);
  if (!list.length) return "Prepare for today's ritual.";
  if (list.length <= 3) return `Required items: ${list.join(", ")}`;
  return `Required items: ${list.slice(0, 3).join(", ")} and ${list.length - 3} more`;
};

/**
 * Notify user that a ritual day was completed.
 */
const notifyRitualDayCompleted = async (
  userId,
  { ritualId, ritualTitle, dayNumber, totalDays, sessionId, attemptNumber }
) => {
  try {
    if (!userId || !ritualId || !sessionId) return;

    const isLastDay = dayNumber >= totalDays;
    const title = isLastDay
      ? "Ritual completed"
      : `Day ${dayNumber} completed`;
    const body = isLastDay
      ? `Congratulations! You completed "${ritualTitle}".`
      : `You finished Day ${dayNumber} of "${ritualTitle}".${
          totalDays > dayNumber ? " Continue tomorrow for the next day." : ""
        }`;

    const data = {
      type: isLastDay ? "RITUAL_COMPLETED" : "RITUAL_DAY_COMPLETED",
      userId: String(userId),
      ritualId: String(ritualId),
      sessionId: String(sessionId),
      dayNumber: String(dayNumber),
      totalDays: String(totalDays),
      attemptNumber: String(attemptNumber || 1),
    };

    await pushWithInbox(userId, {
      notification: { title, body },
      data,
      sourceKey: `ritual:${sessionId}:day:${dayNumber}:completed`,
      logTag: "notifyRitualDayCompleted",
    });
  } catch (err) {
    console.warn("[fcm] notifyRitualDayCompleted failed:", err?.message || err);
  }
};

/**
 * Remind user of required items for the next ritual day.
 */
const notifyRitualNextDayRequiredItems = async (
  userId,
  { ritualId, ritualTitle, dayNumber, requiredItems, sessionId, attemptNumber }
) => {
  try {
    if (!userId || !ritualId || !sessionId) return;

    const title = `Day ${dayNumber} — ${ritualTitle}`;
    const body = formatRequiredItemsBody(requiredItems);

    const data = {
      type: "RITUAL_NEXT_DAY_REMINDER",
      userId: String(userId),
      ritualId: String(ritualId),
      sessionId: String(sessionId),
      dayNumber: String(dayNumber),
      attemptNumber: String(attemptNumber || 1),
      requiredItems: JSON.stringify(requiredItems || []),
    };

    await pushWithInbox(userId, {
      notification: { title, body },
      data,
      sourceKey: `ritual:${sessionId}:day:${dayNumber}:reminder`,
      logTag: "notifyRitualNextDayRequiredItems",
    });
  } catch (err) {
    console.warn("[fcm] notifyRitualNextDayRequiredItems failed:", err?.message || err);
  }
};

/**
 * Notify user that they missed a day and must restart from Day 1.
 */
const notifyRitualRestartedAfterMiss = async (
  userId,
  { ritualId, ritualTitle, missedDayNumber, sessionId, attemptNumber }
) => {
  try {
    if (!userId || !ritualId) return;

    const title = "Ritual restarted";
    const body = `You missed Day ${missedDayNumber} of "${ritualTitle}". Please start again from Day 1.`;

    const data = {
      type: "RITUAL_RESTARTED",
      userId: String(userId),
      ritualId: String(ritualId),
      sessionId: sessionId ? String(sessionId) : "",
      missedDayNumber: String(missedDayNumber),
      attemptNumber: String(attemptNumber || 1),
    };

    await pushWithInbox(userId, {
      notification: { title, body },
      data,
      sourceKey: `ritual:${ritualId}:attempt:${attemptNumber}:restarted`,
      logTag: "notifyRitualRestartedAfterMiss",
    });
  } catch (err) {
    console.warn("[fcm] notifyRitualRestartedAfterMiss failed:", err?.message || err);
  }
};

module.exports = {
  notifyRitualDayCompleted,
  notifyRitualNextDayRequiredItems,
  notifyRitualRestartedAfterMiss,
};
