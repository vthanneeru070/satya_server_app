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
 * variant `upcoming` — sent right after the previous day is completed.
 * variant `today` — sent on the morning of the ritual day (scheduled job).
 */
const notifyRitualNextDayRequiredItems = async (
  userId,
  {
    ritualId,
    ritualTitle,
    dayNumber,
    requiredItems,
    sessionId,
    attemptNumber,
    variant = "today",
  }
) => {
  try {
    if (!userId || !ritualId || !sessionId) return;

    const itemsBody = formatRequiredItemsBody(requiredItems);
    const isUpcoming = variant === "upcoming";
    const title = isUpcoming
      ? `Up next: Day ${dayNumber} — ${ritualTitle}`
      : `Day ${dayNumber} — ${ritualTitle}`;
    const body = isUpcoming
      ? `Prepare for tomorrow. ${itemsBody}`
      : itemsBody;

    const data = {
      type: isUpcoming ? "RITUAL_UPCOMING_DAY_REMINDER" : "RITUAL_NEXT_DAY_REMINDER",
      userId: String(userId),
      ritualId: String(ritualId),
      sessionId: String(sessionId),
      dayNumber: String(dayNumber),
      attemptNumber: String(attemptNumber || 1),
      requiredItems: JSON.stringify(requiredItems || []),
    };

    const sourceKey = isUpcoming
      ? `ritual:${sessionId}:day:${dayNumber}:upcoming`
      : `ritual:${sessionId}:day:${dayNumber}:reminder`;

    await pushWithInbox(userId, {
      notification: { title, body },
      data,
      sourceKey,
      logTag: isUpcoming
        ? "notifyRitualUpcomingDayRequiredItems"
        : "notifyRitualNextDayRequiredItems",
    });
  } catch (err) {
    console.warn("[fcm] notifyRitualNextDayRequiredItems failed:", err?.message || err);
  }
};

/**
 * Morning reminder that the ritual day is today (scheduled at 5:00 local).
 */
const notifyRitualTodayReminder = async (
  userId,
  { ritualId, ritualTitle, dayNumber, totalDays, sessionId, attemptNumber }
) => {
  try {
    if (!userId || !ritualId || !sessionId) return;

    const title = `Your "${ritualTitle}" is today`;
    const body =
      totalDays > 1
        ? `Day ${dayNumber} of your ritual is today. Open the app to continue.`
        : "Your ritual is today. Open the app to begin.";

    const data = {
      type: "RITUAL_TODAY_REMINDER",
      userId: String(userId),
      ritualId: String(ritualId),
      sessionId: String(sessionId),
      dayNumber: String(dayNumber),
      totalDays: String(totalDays || 1),
      attemptNumber: String(attemptNumber || 1),
    };

    await pushWithInbox(userId, {
      notification: { title, body },
      data,
      sourceKey: `ritual:${sessionId}:day:${dayNumber}:today`,
      logTag: "notifyRitualTodayReminder",
    });
  } catch (err) {
    console.warn("[fcm] notifyRitualTodayReminder failed:", err?.message || err);
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
  notifyRitualTodayReminder,
  notifyRitualRestartedAfterMiss,
};
