const { sendSuccess } = require("../utils/response");
const HttpError = require("../utils/httpError");
const replacementService = require("../services/replacementService");
const { uploadFile } = require("../services/s3Service");
const { parseAffectedItemsInput } = require("../utils/orderAffectedItems");

const parseJsonArray = (raw, field) => {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      throw new HttpError(`${field} must be a JSON array of URL strings`, 400);
    }
  }
  return [];
};

const createRequest = async (req, res, next) => {
  try {
    const { orderId, reason, imageUrls: imageUrlsRaw } = req.body;
    const fromJson = parseJsonArray(imageUrlsRaw, "imageUrls");
    const affectedItems = parseAffectedItemsInput(
      req.body.affectedItems,
      "affectedItems"
    );
    const uploaded = await Promise.all(
      (req.files || []).map((file) => uploadFile(file, "replacement-requests"))
    );
    const images = [...fromJson, ...uploaded].filter(Boolean).slice(0, 12);

    const request = await replacementService.createRequest(req.user.userId, {
      orderId,
      reason,
      images,
      affectedItems,
    });
    return sendSuccess(res, { request }, "Replacement request submitted", 201);
  } catch (err) {
    return next(err);
  }
};

const listMyRequests = async (req, res, next) => {
  try {
    const data = await replacementService.listMyRequests(req.user.userId, req.query);
    return sendSuccess(res, data, "Replacement requests fetched");
  } catch (err) {
    return next(err);
  }
};

const getRequestById = async (req, res, next) => {
  try {
    const request = await replacementService.getRequestById(
      req.params.id,
      req.user.userId
    );
    return sendSuccess(res, { request }, "Replacement request fetched");
  } catch (err) {
    return next(err);
  }
};

const listAllAdmin = async (req, res, next) => {
  try {
    const data = await replacementService.listAllForAdmin(req.query);
    return sendSuccess(res, data, "Replacement requests fetched");
  } catch (err) {
    return next(err);
  }
};

const getOneAdmin = async (req, res, next) => {
  try {
    const request = await replacementService.getRequestByIdAdmin(req.params.id);
    return sendSuccess(res, { request }, "Replacement request fetched");
  } catch (err) {
    return next(err);
  }
};

const approveAdmin = async (req, res, next) => {
  try {
    const request = await replacementService.approveRequest(
      req.params.id,
      {
        adminRemarks: req.body?.adminRemarks ?? req.body?.adminNote,
      },
      { actorUserId: req.user.userId }
    );
    return sendSuccess(res, { request }, "Replacement approved and order created");
  } catch (err) {
    return next(err);
  }
};

const rejectAdmin = async (req, res, next) => {
  try {
    const request = await replacementService.rejectRequest(
      req.params.id,
      {
        adminRemarks: req.body?.adminRemarks ?? req.body?.adminNote,
      },
      { actorUserId: req.user.userId }
    );
    return sendSuccess(res, { request }, "Replacement request rejected");
  } catch (err) {
    return next(err);
  }
};

const bookReturnAdmin = async (req, res, next) => {
  try {
    const request = await replacementService.bookReturnShipment(req.params.id, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { request }, "Return collection booked with Courier Guy");
  } catch (err) {
    return next(err);
  }
};

const markReturnReceivedAdmin = async (req, res, next) => {
  try {
    const request = await replacementService.markReturnReceived(req.params.id, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { request }, "Return marked as received at warehouse");
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createRequest,
  listMyRequests,
  getRequestById,
  listAllAdmin,
  getOneAdmin,
  approveAdmin,
  rejectAdmin,
  bookReturnAdmin,
  markReturnReceivedAdmin,
};
