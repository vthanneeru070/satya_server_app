const UserRitualSession = require("../models/UserRitualSession");
const Ritual = require("../models/Ritual");
const User = require("../models/User");
const HttpError = require("../utils/httpError");
const {
  getValidTimeZone,
  getIsoDateKeyInTimeZone,
  getNextIsoDateKey,
  zonedDateTimeToUtc,
} = require("../utils/timezone");
const { isSingleDayRitualType } = require("../utils/ritualDayType");
const {
  notifyRitualDayCompleted,
  notifyRitualNextDayRequiredItems,
  notifyRitualTodayReminder,
  notifyRitualRestartedAfterMiss,
} = require("./fcmRitualNotifyService");

const notDeleted = { isDeleted: { $ne: true } };
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const NEXT_DAY_TODAY_REMINDER_HOUR = 5;
const NEXT_DAY_REQUIRED_ITEMS_REMINDER_HOUR = 6;

const RITUAL_POPULATE = {
  path: "ritual",
  select:
    "title slug description deity category difficulty ritualDay days media status accessType price currency",
  populate: { path: "deity", select: "name media" },
};

const assertMobileUser = async (userId) => {
  const user = await User.findById(userId).select("role isDeleted timezone");
  if (!user || user.isDeleted) throw new HttpError("User not found", 404);
  if (user.role === "admin" || user.role === "superadmin") {
    throw new HttpError("This endpoint is for mobile app users only", 403);
  }
  return user;
};

const resolveTimeZone = (user, override) =>
  getValidTimeZone(override || user?.timezone || DEFAULT_TIMEZONE);

const loadApprovedRitual = async (ritualId) => {
  const ritual = await Ritual.findOne({ _id: ritualId, status: "APPROVED" }).select(
    "_id title ritualDay days"
  );
  if (!ritual) throw new HttpError("Ritual not found or not available", 404);
  return ritual;
};

const totalDaysFor = (ritual) => {
  const days = Array.isArray(ritual?.days) ? ritual.days : [];
  return Math.max(days.length, 1);
};

const getDayDefinition = (ritual, dayNumber) => {
  const days = Array.isArray(ritual?.days) ? ritual.days : [];
  return (
    days.find((d) => Number(d.stepNumber) === Number(dayNumber)) ||
    days[Number(dayNumber) - 1] ||
    null
  );
};

const totalStepsForDay = (ritual, dayNumber) => {
  const dayDef = getDayDefinition(ritual, dayNumber);
  const steps = dayDef?.steps || [];
  if (!steps.length) return 0;
  return Math.max(...steps.map((s) => Number(s.stepNumber) || 0), steps.length);
};

const isMultiDayRitual = (ritual) => !isSingleDayRitualType(ritual?.ritualDay);

const shouldRestartForMiss = (session, ritual, todayKey, timeZone) => {
  if (!isMultiDayRitual(ritual)) return false;
  if (!session.lastCompletedDayDateKey) return false;
  if (!session.completedDays?.length) return false;

  const deadlineKey = getNextIsoDateKey(session.lastCompletedDayDateKey, timeZone);
  return todayKey > deadlineKey;
};

const zonedTimeOnNextDueDate = (lastCompletedDayDateKey, timeZone, hour) => {
  const nextDateKey = getNextIsoDateKey(lastCompletedDayDateKey, timeZone);
  const [year, month, day] = nextDateKey.split("-").map(Number);
  return zonedDateTimeToUtc(
    { year, month, day, hour, minute: 0, second: 0 },
    timeZone
  );
};

const clearNextDayReminders = (session) => {
  session.nextDayReminderAt = null;
  session.nextDayReminderDayNumber = null;
  session.nextDayReminderSent = false;
  session.nextDayStartReminderAt = null;
  session.nextDayStartReminderSent = false;
};

const scheduleNextDayReminder = (session, ritual, timeZone) => {
  const nextDayNum = session.currentDay;
  const totalDays = totalDaysFor(ritual);
  if (nextDayNum > totalDays) {
    clearNextDayReminders(session);
    return;
  }

  session.nextDayStartReminderAt = zonedTimeOnNextDueDate(
    session.lastCompletedDayDateKey,
    timeZone,
    NEXT_DAY_TODAY_REMINDER_HOUR
  );
  session.nextDayStartReminderSent = false;
  session.nextDayReminderAt = zonedTimeOnNextDueDate(
    session.lastCompletedDayDateKey,
    timeZone,
    NEXT_DAY_REQUIRED_ITEMS_REMINDER_HOUR
  );
  session.nextDayReminderDayNumber = nextDayNum;
  session.nextDayReminderSent = false;
};

const markCurrentDayStarted = (session, todayKey) => {
  if (!session.currentDayStartedAt) {
    session.currentDayStartedAt = new Date();
    session.currentDayStartedDateKey = todayKey;
  }
  session.lastActivityAt = new Date();
};

const formatSession = (session, { timeZone } = {}) => {
  const plain = session.toObject ? session.toObject() : { ...session };
  const ritual = plain.ritual;
  const totalDays = totalDaysFor(ritual);
  const daySteps = totalStepsForDay(ritual, plain.currentDay);
  const currentStep = Number(plain.currentStep) || 0;
  const dayProgressPercent =
    daySteps > 0 ? Math.min(100, Math.round((currentStep / daySteps) * 100)) : 0;
  const completedDayCount = Array.isArray(plain.completedDays) ? plain.completedDays.length : 0;
  const overallProgressPercent =
    totalDays > 0 ? Math.min(100, Math.round((completedDayCount / totalDays) * 100)) : 0;

  let nextDayDueDateKey = null;
  if (
    plain.status === "PENDING" &&
    isMultiDayRitual(ritual) &&
    plain.lastCompletedDayDateKey &&
    plain.currentDay > completedDayCount
  ) {
    nextDayDueDateKey = getNextIsoDateKey(plain.lastCompletedDayDateKey, timeZone);
  }

  return {
    ...plain,
    totalDays,
    daySteps,
    dayProgressPercent,
    overallProgressPercent,
    nextDayDueDateKey,
    isMultiDay: isMultiDayRitual(ritual),
    timezone: timeZone || null,
  };
};

const abandonSessionForMiss = async (session, ritual, timeZone) => {
  const missedDayNumber = session.currentDay;
  const attemptNumber = session.attemptNumber || 1;

  session.status = "ABANDONED";
  session.abandonReason = "MISSED_DAY";
  session.abandonedAt = new Date();
  clearNextDayReminders(session);
  session.nextDayReminderSent = true;
  session.nextDayStartReminderSent = true;
  await session.save();

  await notifyRitualRestartedAfterMiss(session.user, {
    ritualId: ritual._id,
    ritualTitle: ritual.title,
    missedDayNumber,
    sessionId: session._id,
    attemptNumber,
  });

  return { missedDayNumber, attemptNumber };
};

const ensureSessionNotMissed = async (session, user, ritual, timeZoneOverride) => {
  const timeZone = resolveTimeZone(user, timeZoneOverride);
  const todayKey = getIsoDateKeyInTimeZone(new Date(), timeZone);

  if (!shouldRestartForMiss(session, ritual, todayKey, timeZone)) {
    return { session, timeZone, todayKey, restarted: false };
  }

  await abandonSessionForMiss(session, ritual, timeZone);
  return { session: null, timeZone, todayKey, restarted: true, missedDayNumber: session.currentDay };
};

const getLatestAttemptNumber = async (userId, ritualId) => {
  const latest = await UserRitualSession.findOne({
    user: userId,
    ritual: ritualId,
    ...notDeleted,
  })
    .sort({ attemptNumber: -1 })
    .select("attemptNumber")
    .lean();

  return latest?.attemptNumber || 0;
};

const createFreshSession = async (userId, ritualId, attemptNumber, todayKey) => {
  const now = new Date();
  return UserRitualSession.create({
    user: userId,
    ritual: ritualId,
    status: "PENDING",
    attemptNumber,
    currentDay: 1,
    currentStep: 0,
    completedDays: [],
    lastCompletedDayDateKey: null,
    currentDayStartedAt: now,
    currentDayStartedDateKey: todayKey,
    startedAt: now,
    lastActivityAt: now,
  });
};

const fetchSessionsPage = async (userId, status, page, limit) => {
  const skip = (page - 1) * limit;
  const filter = { user: userId, status, ...notDeleted };

  const [sessions, total] = await Promise.all([
    UserRitualSession.find(filter)
      .sort(status === "PENDING" ? { updatedAt: -1 } : { finishedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(RITUAL_POPULATE),
    UserRitualSession.countDocuments(filter),
  ]);

  return {
    items: sessions.map((s) => formatSession(s)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const getHistoryOverview = async (userId, query = {}) => {
  const user = await assertMobileUser(userId);

  const pendingPage = Number(query.pendingPage) || 1;
  const pendingLimit = Math.min(Number(query.pendingLimit) || 20, 50);
  const finishedPage = Number(query.finishedPage) || 1;
  const finishedLimit = Math.min(Number(query.finishedLimit) || 20, 50);

  const baseFilter = { user: userId, ...notDeleted };

  const [pendingCount, finishedCount, pendingPageData, finishedPageData] = await Promise.all([
    UserRitualSession.countDocuments({ ...baseFilter, status: "PENDING" }),
    UserRitualSession.countDocuments({ ...baseFilter, status: "FINISHED" }),
    fetchSessionsPage(userId, "PENDING", pendingPage, pendingLimit),
    fetchSessionsPage(userId, "FINISHED", finishedPage, finishedLimit),
  ]);

  const timeZone = resolveTimeZone(user);

  return {
    pendingCount,
    finishedCount,
    totalCount: pendingCount + finishedCount,
    pending: pendingPageData.items.map((s) => ({ ...s, timezone: timeZone })),
    finished: finishedPageData.items.map((s) => ({ ...s, timezone: timeZone })),
    pagination: {
      pending: pendingPageData.pagination,
      finished: finishedPageData.pagination,
    },
  };
};

const listHistory = async (userId, query = {}) => {
  const user = await assertMobileUser(userId);
  const timeZone = resolveTimeZone(user);

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 50);
  const skip = (page - 1) * limit;

  const filter = { user: userId, ...notDeleted };
  if (query.status) filter.status = query.status;

  const [sessions, total] = await Promise.all([
    UserRitualSession.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(RITUAL_POPULATE),
    UserRitualSession.countDocuments(filter),
  ]);

  const items = sessions.map((s) => formatSession(s, { timeZone }));

  return {
    sessions: items,
    pending: query.status === "PENDING" ? items : undefined,
    finished: query.status === "FINISHED" ? items : undefined,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const getSessionById = async (userId, sessionId, { timeZone: timeZoneOverride } = {}) => {
  const user = await assertMobileUser(userId);

  let session = await UserRitualSession.findOne({
    _id: sessionId,
    user: userId,
    ...notDeleted,
  }).populate(RITUAL_POPULATE);

  if (!session) throw new HttpError("Ritual session not found", 404);

  const ritual = session.ritual;
  if (session.status === "PENDING") {
    const check = await ensureSessionNotMissed(session, user, ritual, timeZoneOverride);
    if (check.restarted) {
      throw new HttpError(
        `You missed Day ${check.missedDayNumber}. Please start the ritual again from Day 1.`,
        409
      );
    }
    session = check.session;
  }

  const timeZone = resolveTimeZone(user, timeZoneOverride);
  return { session: formatSession(session, { timeZone }) };
};

const startRitual = async (userId, ritualId, { timeZone: timeZoneOverride } = {}) => {
  const user = await assertMobileUser(userId);
  const ritual = await loadApprovedRitual(ritualId);
  const timeZone = resolveTimeZone(user, timeZoneOverride);
  const todayKey = getIsoDateKeyInTimeZone(new Date(), timeZone);

  let session = await UserRitualSession.findOne({
    user: userId,
    ritual: ritualId,
    status: "PENDING",
    ...notDeleted,
  }).populate(RITUAL_POPULATE);

  if (session) {
    const check = await ensureSessionNotMissed(session, user, ritual, timeZoneOverride);
    if (check.restarted) {
      const nextAttempt = (await getLatestAttemptNumber(userId, ritualId)) + 1;
      session = await createFreshSession(userId, ritualId, nextAttempt, todayKey);
      await session.populate(RITUAL_POPULATE);
      return {
        session: formatSession(session, { timeZone }),
        resumed: false,
        restartedAfterMiss: true,
        missedDayNumber: check.missedDayNumber,
      };
    }
    return { session: formatSession(session, { timeZone }), resumed: true };
  }

  const nextAttempt = (await getLatestAttemptNumber(userId, ritualId)) + 1;

  try {
    session = await createFreshSession(userId, ritualId, nextAttempt, todayKey);
  } catch (err) {
    if (err.code === 11000) {
      session = await UserRitualSession.findOne({
        user: userId,
        ritual: ritualId,
        status: "PENDING",
        ...notDeleted,
      }).populate(RITUAL_POPULATE);
      if (session) {
        return { session: formatSession(session, { timeZone }), resumed: true };
      }
    }
    throw err;
  }

  await session.populate(RITUAL_POPULATE);
  return { session: formatSession(session, { timeZone }), resumed: false };
};

const startDay = async (userId, sessionId, { timeZone: timeZoneOverride } = {}) => {
  const user = await assertMobileUser(userId);
  const timeZone = resolveTimeZone(user, timeZoneOverride);
  const todayKey = getIsoDateKeyInTimeZone(new Date(), timeZone);

  let session = await UserRitualSession.findOne({
    _id: sessionId,
    user: userId,
    status: "PENDING",
    ...notDeleted,
  }).populate(RITUAL_POPULATE);

  if (!session) throw new HttpError("No in-progress ritual session found", 404);

  const ritual = session.ritual;
  const check = await ensureSessionNotMissed(session, user, ritual, timeZoneOverride);
  if (check.restarted) {
    throw new HttpError(
      `You missed Day ${check.missedDayNumber}. Please start the ritual again from Day 1.`,
      409
    );
  }
  session = check.session;

  if (isMultiDayRitual(ritual) && session.lastCompletedDayDateKey) {
    const dueKey = getNextIsoDateKey(session.lastCompletedDayDateKey, timeZone);
    if (todayKey !== dueKey) {
      throw new HttpError(
        `Day ${session.currentDay} must be performed on ${dueKey} (your local date). Today is ${todayKey}.`,
        400
      );
    }
  }

  markCurrentDayStarted(session, todayKey);
  session.currentStep = 0;
  await session.save();

  return { session: formatSession(session, { timeZone }) };
};

const updateProgress = async (
  userId,
  sessionId,
  { currentStep, currentDay },
  { timeZone: timeZoneOverride } = {}
) => {
  const user = await assertMobileUser(userId);
  const timeZone = resolveTimeZone(user, timeZoneOverride);
  const todayKey = getIsoDateKeyInTimeZone(new Date(), timeZone);

  let session = await UserRitualSession.findOne({
    _id: sessionId,
    user: userId,
    status: "PENDING",
    ...notDeleted,
  }).populate(RITUAL_POPULATE);

  if (!session) throw new HttpError("No in-progress ritual session found", 404);

  const ritual = session.ritual;
  const check = await ensureSessionNotMissed(session, user, ritual, timeZoneOverride);
  if (check.restarted) {
    throw new HttpError(
      `You missed Day ${check.missedDayNumber}. Please start the ritual again from Day 1.`,
      409
    );
  }
  session = check.session;

  if (currentDay != null && Number(currentDay) !== session.currentDay) {
    throw new HttpError(`Cannot update progress for day ${currentDay}; current day is ${session.currentDay}`, 400);
  }

  if (isMultiDayRitual(ritual) && session.lastCompletedDayDateKey && !session.currentDayStartedAt) {
    const dueKey = getNextIsoDateKey(session.lastCompletedDayDateKey, timeZone);
    if (todayKey !== dueKey) {
      throw new HttpError(
        `Day ${session.currentDay} must be performed on ${dueKey} (your local date). Today is ${todayKey}.`,
        400
      );
    }
  }

  markCurrentDayStarted(session, todayKey);

  const daySteps = totalStepsForDay(ritual, session.currentDay);
  if (daySteps > 0 && currentStep > daySteps) {
    throw new HttpError(`currentStep cannot exceed ${daySteps} for day ${session.currentDay}`, 400);
  }

  session.currentStep = currentStep;
  await session.save();

  return { session: formatSession(session, { timeZone }) };
};

const completeDay = async (userId, sessionId, { timeZone: timeZoneOverride } = {}) => {
  const user = await assertMobileUser(userId);
  const timeZone = resolveTimeZone(user, timeZoneOverride);
  const todayKey = getIsoDateKeyInTimeZone(new Date(), timeZone);

  let session = await UserRitualSession.findOne({
    _id: sessionId,
    user: userId,
    status: "PENDING",
    ...notDeleted,
  }).populate(RITUAL_POPULATE);

  if (!session) throw new HttpError("No in-progress ritual session found", 404);

  const ritual = session.ritual;
  const check = await ensureSessionNotMissed(session, user, ritual, timeZoneOverride);
  if (check.restarted) {
    throw new HttpError(
      `You missed Day ${check.missedDayNumber}. Please start the ritual again from Day 1.`,
      409
    );
  }
  session = check.session;

  const dayNumber = session.currentDay;
  const totalDays = totalDaysFor(ritual);

  if (isMultiDayRitual(ritual) && session.lastCompletedDayDateKey) {
    const dueKey = getNextIsoDateKey(session.lastCompletedDayDateKey, timeZone);
    if (todayKey !== dueKey) {
      throw new HttpError(
        `Day ${dayNumber} must be completed on ${dueKey} (your local date). Today is ${todayKey}.`,
        400
      );
    }
  }

  if (!session.currentDayStartedAt) {
    markCurrentDayStarted(session, todayKey);
  }

  const daySteps = totalStepsForDay(ritual, dayNumber);
  if (daySteps > 0 && session.currentStep < daySteps) {
    throw new HttpError(
      `Complete all steps for day ${dayNumber} before marking the day finished (${session.currentStep}/${daySteps})`,
      400
    );
  }

  const now = new Date();
  session.completedDays.push({
    dayNumber,
    completedAt: now,
    dateKey: todayKey,
  });
  session.lastCompletedDayDateKey = todayKey;
  session.lastActivityAt = now;

  const isLastDay = dayNumber >= totalDays;

  if (isLastDay) {
    session.status = "FINISHED";
    session.finishedAt = now;
    session.currentStep = daySteps > 0 ? daySteps : session.currentStep;
    clearNextDayReminders(session);
    session.nextDayReminderSent = true;
    session.nextDayStartReminderSent = true;
  } else {
    session.currentDay = dayNumber + 1;
    session.currentStep = 0;
    session.currentDayStartedAt = null;
    session.currentDayStartedDateKey = null;
    scheduleNextDayReminder(session, ritual, timeZone);
  }

  await session.save();

  await notifyRitualDayCompleted(session.user, {
    ritualId: ritual._id,
    ritualTitle: ritual.title,
    dayNumber,
    totalDays,
    sessionId: session._id,
    attemptNumber: session.attemptNumber,
  });

  if (!isLastDay) {
    const nextDayNum = session.currentDay;
    const nextDayDef = getDayDefinition(ritual, nextDayNum);
    await notifyRitualNextDayRequiredItems(session.user, {
      ritualId: ritual._id,
      ritualTitle: ritual.title,
      dayNumber: nextDayNum,
      requiredItems: nextDayDef?.requiredItems || [],
      sessionId: session._id,
      attemptNumber: session.attemptNumber,
      variant: "upcoming",
    });
  }

  return {
    session: formatSession(session, { timeZone }),
    dayCompleted: dayNumber,
    ritualFinished: isLastDay,
  };
};

const finishRitual = async (userId, ritualId, { timeZone: timeZoneOverride } = {}) => {
  const user = await assertMobileUser(userId);
  const ritual = await loadApprovedRitual(ritualId);
  const timeZone = resolveTimeZone(user, timeZoneOverride);

  let session = await UserRitualSession.findOne({
    user: userId,
    ritual: ritualId,
    status: "PENDING",
    ...notDeleted,
  }).populate(RITUAL_POPULATE);

  if (!session) throw new HttpError("No in-progress ritual session found for this ritual", 404);

  const check = await ensureSessionNotMissed(session, user, ritual, timeZoneOverride);
  if (check.restarted) {
    throw new HttpError(
      `You missed Day ${check.missedDayNumber}. Please start the ritual again from Day 1.`,
      409
    );
  }
  session = check.session;

  const totalDays = totalDaysFor(ritual);
  const completedCount = session.completedDays?.length || 0;
  if (completedCount < totalDays) {
    throw new HttpError(
      `Complete all ${totalDays} day(s) before finishing the ritual (${completedCount}/${totalDays} done)`,
      400
    );
  }

  session.status = "FINISHED";
  session.finishedAt = new Date();
  clearNextDayReminders(session);
  session.nextDayReminderSent = true;
  session.nextDayStartReminderSent = true;
  await session.save();

  return { session: formatSession(session, { timeZone }) };
};

const finishRitualBySession = async (userId, sessionId, options = {}) => {
  const user = await assertMobileUser(userId);

  const session = await UserRitualSession.findOne({
    _id: sessionId,
    user: userId,
    status: "PENDING",
    ...notDeleted,
  }).select("ritual");

  if (!session) throw new HttpError("No in-progress ritual session found", 404);

  const ritualId = session.ritual?._id || session.ritual;
  return finishRitual(userId, ritualId, options);
};

/**
 * Background job: send due "ritual is today" reminders (5:00 local).
 */
const processDueTodayReminders = async () => {
  const now = new Date();
  const dueSessions = await UserRitualSession.find({
    status: "PENDING",
    nextDayStartReminderAt: { $lte: now },
    nextDayStartReminderSent: { $ne: true },
    ...notDeleted,
  })
    .limit(50)
    .populate(RITUAL_POPULATE);

  for (const session of dueSessions) {
    const claimed = await UserRitualSession.findOneAndUpdate(
      {
        _id: session._id,
        nextDayStartReminderSent: { $ne: true },
        status: "PENDING",
      },
      { $set: { nextDayStartReminderSent: true } },
      { new: true }
    );

    if (!claimed) continue;

    const ritual = session.ritual;
    const dayNumber = session.nextDayReminderDayNumber || session.currentDay;

    await notifyRitualTodayReminder(session.user, {
      ritualId: ritual._id,
      ritualTitle: ritual.title,
      dayNumber,
      totalDays: totalDaysFor(ritual),
      sessionId: session._id,
      attemptNumber: session.attemptNumber,
    });
  }
};

/**
 * Background job: send due next-day required-items reminders (6:00 local).
 */
const processDueReminders = async () => {
  const now = new Date();
  const dueSessions = await UserRitualSession.find({
    status: "PENDING",
    nextDayReminderAt: { $lte: now },
    nextDayReminderSent: { $ne: true },
    ...notDeleted,
  })
    .limit(50)
    .populate(RITUAL_POPULATE);

  for (const session of dueSessions) {
    const claimed = await UserRitualSession.findOneAndUpdate(
      {
        _id: session._id,
        nextDayReminderSent: { $ne: true },
        status: "PENDING",
      },
      { $set: { nextDayReminderSent: true } },
      { new: true }
    );

    if (!claimed) continue;

    const ritual = session.ritual;
    const dayNumber = session.nextDayReminderDayNumber || session.currentDay;
    const dayDef = getDayDefinition(ritual, dayNumber);
    const requiredItems = dayDef?.requiredItems || [];

    await notifyRitualNextDayRequiredItems(session.user, {
      ritualId: ritual._id,
      ritualTitle: ritual.title,
      dayNumber,
      requiredItems,
      sessionId: session._id,
      attemptNumber: session.attemptNumber,
    });
  }
};

/**
 * Background job: abandon sessions where the user missed the next calendar day.
 */
const processMissedSessions = async () => {
  const pendingSessions = await UserRitualSession.find({
    status: "PENDING",
    lastCompletedDayDateKey: { $ne: null },
    ...notDeleted,
  })
    .limit(100)
    .populate(RITUAL_POPULATE)
    .populate({ path: "user", select: "timezone role isDeleted" });

  for (const session of pendingSessions) {
    if (!session.user || session.user.isDeleted) continue;
    if (session.user.role === "admin" || session.user.role === "superadmin") continue;

    const ritual = session.ritual;
    if (!isMultiDayRitual(ritual)) continue;

    const timeZone = resolveTimeZone(session.user);
    const todayKey = getIsoDateKeyInTimeZone(new Date(), timeZone);

    if (!shouldRestartForMiss(session, ritual, todayKey, timeZone)) continue;

    await abandonSessionForMiss(session, ritual, timeZone);
  }
};

const runRitualTrackingJobs = async () => {
  try {
    await processDueTodayReminders();
    await processDueReminders();
    await processMissedSessions();
  } catch (err) {
    console.warn("[ritual-tracking] job failed:", err?.message || err);
  }
};

module.exports = {
  getHistoryOverview,
  listHistory,
  getSessionById,
  startRitual,
  startDay,
  updateProgress,
  completeDay,
  finishRitual,
  finishRitualBySession,
  processDueReminders,
  processMissedSessions,
  runRitualTrackingJobs,
};
