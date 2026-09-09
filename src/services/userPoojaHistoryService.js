const crypto = require("crypto");
const UserPoojaSession = require("../models/UserPoojaSession");
const Pooja = require("../models/Pooja");
const User = require("../models/User");
const HttpError = require("../utils/httpError");
const {
  countSessionsWithExistingContent,
  fetchSessionsWithExistingContent,
} = require("../utils/sessionHistoryQuery");

const notDeleted = { isDeleted: { $ne: true } };

const POOJA_POPULATE = {
  path: "pooja",
  select:
    "title schedules deity category difficulty duration ideal_time description accessType price currency media status steps",
  populate: { path: "deity", select: "name media" },
};

const POOJA_HISTORY_REF = {
  refField: "pooja",
  collectionName: "poojas",
  refNotDeleted: false,
};

const assertMobileUser = async (userId) => {
  const user = await User.findById(userId).select("role isDeleted");
  if (!user || user.isDeleted) throw new HttpError("User not found", 404);
  if (user.role === "admin" || user.role === "superadmin") {
    throw new HttpError("This endpoint is for mobile app users only", 403);
  }
};

const loadApprovedPooja = async (poojaId) => {
  const pooja = await Pooja.findOne({ _id: poojaId, status: "APPROVED" }).select(
    "_id title steps schedules"
  );
  if (!pooja) throw new HttpError("Pooja not found or not available", 404);

  // Backfill legacy schedules without ids so clients can consistently pass scheduleId.
  if (Array.isArray(pooja.schedules) && pooja.schedules.some((s) => !s?.id)) {
    pooja.schedules = pooja.schedules.map((slot) => ({
      ...slot.toObject?.(),
      id: slot?.id || `sch_${crypto.randomUUID()}`,
    }));
    await pooja.save();
  }

  return pooja;
};

const resolveScheduleForSession = ({ pooja, scheduleId }) => {
  const schedules = Array.isArray(pooja?.schedules) ? pooja.schedules : [];

  if (!schedules.length) {
    return null;
  }

  if (scheduleId) {
    const matched = schedules.find((slot) => String(slot.id) === String(scheduleId).trim());
    if (!matched) {
      throw new HttpError("Invalid scheduleId for this pooja", 400);
    }
    return String(matched.id);
  }

  if (schedules.length === 1) {
    return String(schedules[0].id);
  }

  throw new HttpError("scheduleId is required for poojas with multiple schedules", 400);
};

const totalStepsFor = (pooja) => {
  const steps = pooja?.steps || [];
  if (!steps.length) return 0;
  return Math.max(...steps.map((s) => Number(s.stepNumber) || 0), steps.length);
};

const formatSession = (session) => {
  const plain = session.toObject ? session.toObject() : { ...session };
  const pooja = plain.pooja;
  const totalSteps = totalStepsFor(pooja);
  const currentStep = Number(plain.currentStep) || 0;
  const progressPercent =
    totalSteps > 0 ? Math.min(100, Math.round((currentStep / totalSteps) * 100)) : 0;

  return {
    ...plain,
    totalSteps,
    progressPercent,
    pooja,
  };
};

const fetchSessionsPage = async (userId, status, page, limit) => {
  const sort =
    status === "PENDING"
      ? { updatedAt: -1 }
      : { finishedAt: -1, updatedAt: -1 };

  const { docs, total } = await fetchSessionsWithExistingContent({
    SessionModel: UserPoojaSession,
    userId,
    status,
    page,
    limit,
    sort,
    ...POOJA_HISTORY_REF,
  });

  await UserPoojaSession.populate(docs, POOJA_POPULATE);

  return {
    items: docs.filter((s) => s.pooja).map(formatSession),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

/**
 * Dashboard payload: total counts + paginated pending & finished lists with pooja details.
 */
const getHistoryOverview = async (userId, query = {}) => {
  await assertMobileUser(userId);

  const pendingPage = Number(query.pendingPage) || 1;
  const pendingLimit = Math.min(Number(query.pendingLimit) || 20, 50);
  const finishedPage = Number(query.finishedPage) || 1;
  const finishedLimit = Math.min(Number(query.finishedLimit) || 20, 50);

  const [pendingCount, finishedCount, pendingPageData, finishedPageData] = await Promise.all([
    countSessionsWithExistingContent({
      SessionModel: UserPoojaSession,
      userId,
      status: "PENDING",
      ...POOJA_HISTORY_REF,
    }),
    countSessionsWithExistingContent({
      SessionModel: UserPoojaSession,
      userId,
      status: "FINISHED",
      ...POOJA_HISTORY_REF,
    }),
    fetchSessionsPage(userId, "PENDING", pendingPage, pendingLimit),
    fetchSessionsPage(userId, "FINISHED", finishedPage, finishedLimit),
  ]);

  return {
    pendingCount,
    finishedCount,
    totalCount: pendingCount + finishedCount,
    pending: pendingPageData.items,
    finished: finishedPageData.items,
    pagination: {
      pending: pendingPageData.pagination,
      finished: finishedPageData.pagination,
    },
  };
};

const listHistory = async (userId, query = {}) => {
  await assertMobileUser(userId);

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 50);
  const status = query.status || undefined;

  const { docs, total } = await fetchSessionsWithExistingContent({
    SessionModel: UserPoojaSession,
    userId,
    status,
    page,
    limit,
    sort: { updatedAt: -1 },
    ...POOJA_HISTORY_REF,
  });

  await UserPoojaSession.populate(docs, POOJA_POPULATE);
  const items = docs.filter((s) => s.pooja).map(formatSession);

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

const startPooja = async (userId, poojaId, { scheduleId } = {}) => {
  await assertMobileUser(userId);
  const pooja = await loadApprovedPooja(poojaId);
  const resolvedScheduleId = resolveScheduleForSession({ pooja, scheduleId });

  let session = await UserPoojaSession.findOne({
    user: userId,
    pooja: poojaId,
    scheduleId: resolvedScheduleId,
    status: "PENDING",
    ...notDeleted,
  }).populate(POOJA_POPULATE);

  if (session) {
    return { session: formatSession(session), resumed: true };
  }

  try {
    session = await UserPoojaSession.create({
      user: userId,
      pooja: poojaId,
      scheduleId: resolvedScheduleId,
      status: "PENDING",
      currentStep: 0,
      startedAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      session = await UserPoojaSession.findOne({
        user: userId,
        pooja: poojaId,
        scheduleId: resolvedScheduleId,
        status: "PENDING",
        ...notDeleted,
      }).populate(POOJA_POPULATE);
      if (session) return { session: formatSession(session), resumed: true };
    }
    throw err;
  }

  await session.populate(POOJA_POPULATE);
  return { session: formatSession(session), resumed: false };
};

const updateProgress = async (userId, sessionId, { currentStep }) => {
  await assertMobileUser(userId);

  const session = await UserPoojaSession.findOne({
    _id: sessionId,
    user: userId,
    status: "PENDING",
    ...notDeleted,
  }).populate(POOJA_POPULATE);

  if (!session) {
    throw new HttpError("No in-progress pooja session found", 404);
  }

  const total = totalStepsFor(session.pooja);
  if (total > 0 && currentStep > total) {
    throw new HttpError(`currentStep cannot exceed ${total}`, 400);
  }

  session.currentStep = currentStep;
  await session.save();

  return { session: formatSession(session) };
};

const finishPooja = async (userId, poojaId, { scheduleId } = {}) => {
  await assertMobileUser(userId);
  const pooja = await loadApprovedPooja(poojaId);
  const resolvedScheduleId = resolveScheduleForSession({ pooja, scheduleId });

  const session = await UserPoojaSession.findOne({
    user: userId,
    pooja: poojaId,
    scheduleId: resolvedScheduleId,
    status: "PENDING",
    ...notDeleted,
  }).populate(POOJA_POPULATE);

  if (!session) {
    throw new HttpError("No in-progress pooja session found for this pooja", 404);
  }

  const total = totalStepsFor(session.pooja);
  session.currentStep = total > 0 ? total : session.currentStep;
  session.status = "FINISHED";
  session.finishedAt = new Date();
  await session.save();

  return { session: formatSession(session) };
};

const finishPoojaBySessionId = async (userId, sessionId) => {
  await assertMobileUser(userId);

  const session = await UserPoojaSession.findOne({
    _id: sessionId,
    user: userId,
    status: "PENDING",
    ...notDeleted,
  }).populate(POOJA_POPULATE);

  if (!session) {
    throw new HttpError("No in-progress pooja session found", 404);
  }

  const poojaId = session.pooja?._id || session.pooja;
  return finishPooja(userId, poojaId, { scheduleId: session.scheduleId });
};

module.exports = {
  getHistoryOverview,
  listHistory,
  startPooja,
  updateProgress,
  finishPooja,
  finishPoojaBySessionId,
};
