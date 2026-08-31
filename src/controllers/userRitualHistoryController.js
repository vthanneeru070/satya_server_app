const { sendSuccess } = require("../utils/response");
const userRitualHistoryService = require("../services/userRitualHistoryService");

const timeZoneFromQuery = (query) => query?.timezone || undefined;

const listRitualHistory = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    if (!req.query.status) {
      const data = await userRitualHistoryService.getHistoryOverview(userId, req.query);
      return sendSuccess(res, data, "Ritual history overview fetched successfully");
    }
    const data = await userRitualHistoryService.listHistory(userId, req.query);
    const message =
      req.query.status === "PENDING"
        ? "Pending rituals fetched successfully"
        : "Finished rituals fetched successfully";
    return sendSuccess(res, data, message);
  } catch (error) {
    return next(error);
  }
};

const listPendingRituals = async (req, res, next) => {
  try {
    const data = await userRitualHistoryService.listHistory(req.user.userId, {
      ...req.query,
      status: "PENDING",
    });
    return sendSuccess(res, data, "Pending rituals fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const listFinishedRituals = async (req, res, next) => {
  try {
    const data = await userRitualHistoryService.listHistory(req.user.userId, {
      ...req.query,
      status: "FINISHED",
    });
    return sendSuccess(res, data, "Finished rituals fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getSession = async (req, res, next) => {
  try {
    const data = await userRitualHistoryService.getSessionById(
      req.user.userId,
      req.params.sessionId,
      { timeZone: timeZoneFromQuery(req.query) }
    );
    return sendSuccess(res, data, "Ritual session fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const startRitual = async (req, res, next) => {
  try {
    const data = await userRitualHistoryService.startRitual(
      req.user.userId,
      req.params.ritualId,
      { timeZone: timeZoneFromQuery(req.query) }
    );
    const message = data.restartedAfterMiss
      ? "Previous attempt missed a day — new ritual started from Day 1"
      : data.resumed
        ? "Ritual session resumed"
        : "Ritual started successfully";
    const statusCode = data.resumed && !data.restartedAfterMiss ? 200 : 201;
    return sendSuccess(res, data, message, statusCode);
  } catch (error) {
    return next(error);
  }
};

const startDay = async (req, res, next) => {
  try {
    const data = await userRitualHistoryService.startDay(
      req.user.userId,
      req.params.sessionId,
      { timeZone: timeZoneFromQuery(req.query) }
    );
    return sendSuccess(res, data, "Ritual day started");
  } catch (error) {
    return next(error);
  }
};

const updateProgress = async (req, res, next) => {
  try {
    const data = await userRitualHistoryService.updateProgress(
      req.user.userId,
      req.params.sessionId,
      req.body,
      { timeZone: timeZoneFromQuery(req.query) }
    );
    return sendSuccess(res, data, "Progress updated");
  } catch (error) {
    return next(error);
  }
};

const completeDay = async (req, res, next) => {
  try {
    const data = await userRitualHistoryService.completeDay(
      req.user.userId,
      req.params.sessionId,
      { timeZone: timeZoneFromQuery(req.query) }
    );
    const message = data.ritualFinished
      ? "Ritual completed successfully"
      : `Day ${data.dayCompleted} completed successfully`;
    return sendSuccess(res, data, message);
  } catch (error) {
    return next(error);
  }
};

const finishRitual = async (req, res, next) => {
  try {
    const data = await userRitualHistoryService.finishRitual(
      req.user.userId,
      req.params.ritualId,
      { timeZone: timeZoneFromQuery(req.query) }
    );
    return sendSuccess(res, data, "Ritual completed successfully");
  } catch (error) {
    return next(error);
  }
};

const finishRitualBySession = async (req, res, next) => {
  try {
    const data = await userRitualHistoryService.finishRitualBySession(
      req.user.userId,
      req.params.sessionId,
      { timeZone: timeZoneFromQuery(req.query) }
    );
    return sendSuccess(res, data, "Ritual completed successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listRitualHistory,
  listPendingRituals,
  listFinishedRituals,
  getSession,
  startRitual,
  startDay,
  updateProgress,
  completeDay,
  finishRitual,
  finishRitualBySession,
};
