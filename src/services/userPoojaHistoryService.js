const UserPoojaSession = require("../models/UserPoojaSession");
const Pooja = require("../models/Pooja");
const User = require("../models/User");
const HttpError = require("../utils/httpError");

const notDeleted = { isDeleted: { $ne: true } };

const POOJA_POPULATE = {
  path: "pooja",
  select:
    "title schedules deity category difficulty duration description accessType price currency media status steps",
  populate: { path: "deity", select: "name media" },
};

const assertMobileUser = async (userId) => {
  const user = await User.findById(userId).select("role isDeleted");
  if (!user || user.isDeleted) throw new HttpError("User not found", 404);
  if (user.role === "admin" || user.role === "superadmin") {
    throw new HttpError("This endpoint is for mobile app users only", 403);
  }
};

const loadApprovedPooja = async (poojaId) => {
  const pooja = await Pooja.findOne({ _id: poojaId, status: "APPROVED" }).select("_id title steps");
  if (!pooja) throw new HttpError("Pooja not found or not available", 404);
  return pooja;
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
  const skip = (page - 1) * limit;
  const filter = { user: userId, status, ...notDeleted };

  const [sessions, total] = await Promise.all([
    UserPoojaSession.find(filter)
      .sort(status === "PENDING" ? { updatedAt: -1 } : { finishedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(POOJA_POPULATE),
    UserPoojaSession.countDocuments(filter),
  ]);

  return {
    items: sessions.map(formatSession),
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

  const baseFilter = { user: userId, ...notDeleted };

  const [pendingCount, finishedCount, pendingPageData, finishedPageData] = await Promise.all([
    UserPoojaSession.countDocuments({ ...baseFilter, status: "PENDING" }),
    UserPoojaSession.countDocuments({ ...baseFilter, status: "FINISHED" }),
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
  const skip = (page - 1) * limit;

  const filter = { user: userId, ...notDeleted };
  if (query.status) filter.status = query.status;

  const [sessions, total] = await Promise.all([
    UserPoojaSession.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(POOJA_POPULATE),
    UserPoojaSession.countDocuments(filter),
  ]);

  const items = sessions.map(formatSession);

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

const startPooja = async (userId, poojaId) => {
  await assertMobileUser(userId);
  await loadApprovedPooja(poojaId);

  let session = await UserPoojaSession.findOne({
    user: userId,
    pooja: poojaId,
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
      status: "PENDING",
      currentStep: 0,
      startedAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      session = await UserPoojaSession.findOne({
        user: userId,
        pooja: poojaId,
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

const finishPooja = async (userId, poojaId) => {
  await assertMobileUser(userId);

  const session = await UserPoojaSession.findOne({
    user: userId,
    pooja: poojaId,
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
  return finishPooja(userId, poojaId);
};

module.exports = {
  getHistoryOverview,
  listHistory,
  startPooja,
  updateProgress,
  finishPooja,
  finishPoojaBySessionId,
};
