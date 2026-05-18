const { sendSuccess } = require("../utils/response");
const userPoojaHistoryService = require("../services/userPoojaHistoryService");

const listPoojaHistory = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    if (!req.query.status) {
      const data = await userPoojaHistoryService.getHistoryOverview(userId, req.query);
      return sendSuccess(res, data, "Pooja history overview fetched successfully");
    }
    const data = await userPoojaHistoryService.listHistory(userId, req.query);
    const message =
      req.query.status === "PENDING"
        ? "Pending poojas fetched successfully"
        : "Finished poojas fetched successfully";
    return sendSuccess(res, data, message);
  } catch (error) {
    return next(error);
  }
};

const listPendingPoojas = async (req, res, next) => {
  try {
    const data = await userPoojaHistoryService.listHistory(req.user.userId, {
      ...req.query,
      status: "PENDING",
    });
    return sendSuccess(res, data, "Pending poojas fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const listFinishedPoojas = async (req, res, next) => {
  try {
    const data = await userPoojaHistoryService.listHistory(req.user.userId, {
      ...req.query,
      status: "FINISHED",
    });
    return sendSuccess(res, data, "Finished poojas fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const startPooja = async (req, res, next) => {
  try {
    const data = await userPoojaHistoryService.startPooja(req.user.userId, req.params.poojaId);
    return sendSuccess(
      res,
      data,
      data.resumed ? "Pooja session resumed" : "Pooja started successfully",
      data.resumed ? 200 : 201
    );
  } catch (error) {
    return next(error);
  }
};

const updateProgress = async (req, res, next) => {
  try {
    const data = await userPoojaHistoryService.updateProgress(
      req.user.userId,
      req.params.sessionId,
      req.body
    );
    return sendSuccess(res, data, "Progress updated");
  } catch (error) {
    return next(error);
  }
};

const finishPooja = async (req, res, next) => {
  try {
    const data = await userPoojaHistoryService.finishPooja(req.user.userId, req.params.poojaId);
    return sendSuccess(res, data, "Pooja completed successfully");
  } catch (error) {
    return next(error);
  }
};

const finishPoojaBySession = async (req, res, next) => {
  try {
    const data = await userPoojaHistoryService.finishPoojaBySessionId(
      req.user.userId,
      req.params.sessionId
    );
    return sendSuccess(res, data, "Pooja completed successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listPoojaHistory,
  listPendingPoojas,
  listFinishedPoojas,
  startPooja,
  updateProgress,
  finishPooja,
  finishPoojaBySession,
};
