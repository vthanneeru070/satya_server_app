const Festival = require("../models/Festival");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { uploadFile, deleteFile } = require("../services/s3Service");

const canModifyFestival = (festival, user) =>
  user.isSuperAdmin === true || festival.createdBy.toString() === user.userId;

const toBoolean = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  throw new HttpError(`${fieldName} must be true or false`, 400);
};

const toNumber = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new HttpError(`${fieldName} must be a valid number`, 400);
  }

  return parsed;
};

const parseLocation = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "object" && value !== null) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }
    } catch (_error) {
      throw new HttpError("location must be a valid JSON object", 400);
    }
  }

  throw new HttpError("location must be a valid object", 400);
};

const parseRituals = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_error) {
      if (trimmed.includes(",")) {
        return trimmed
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }

      return [trimmed];
    }
  }

  throw new HttpError("rituals must be an array or comma separated string", 400);
};

const createFestival = async (req, res, next) => {
  try {
    const {
      title,
      description,
      date,
      endDate,
      category,
      status,
    } = req.body;
    const isGlobal = toBoolean(req.body.isGlobal, "isGlobal");
    const notifyUsers = toBoolean(req.body.notifyUsers, "notifyUsers");
    const notificationDaysBefore = toNumber(
      req.body.notificationDaysBefore,
      "notificationDaysBefore"
    );
    const location = parseLocation(req.body.location);
    const rituals = parseRituals(req.body.rituals);

    if (!req.file) {
      throw new HttpError("Festival image is required", 400);
    }

    const image = await uploadFile(req.file, "festivals");

    const festival = await Festival.create({
      title,
      description,
      date,
      endDate,
      image,
      rituals,
      category,
      isGlobal,
      location,
      notifyUsers,
      notificationDaysBefore,
      createdBy: req.user.userId,
      status: status || "PENDING",
      isVisible: false,
    });

    return sendSuccess(res, { festival }, "Festival created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getMyFestivals = async (req, res, next) => {
  try {
    const festivals = await Festival.find({ createdBy: req.user.userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(res, { festivals }, "My festivals fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getAllFestivals = async (_req, res, next) => {
  try {
    const festivals = await Festival.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(res, { festivals }, "All festivals fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getVisibleFestivals = async (_req, res, next) => {
  try {
    const festivals = await Festival.find({
      status: "APPROVED",
      isVisible: true,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "email role");

    return sendSuccess(res, { festivals }, "Approved festivals fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const updateFestival = async (req, res, next) => {
  try {
    const festival = await Festival.findOne({ _id: req.params.id, isDeleted: false });

    if (!festival) {
      throw new HttpError("Festival not found", 404);
    }

    if (!canModifyFestival(festival, req.user)) {
      throw new HttpError("You are not authorized to modify this festival", 403);
    }

    const {
      title,
      description,
      date,
      endDate,
      category,
      status,
    } = req.body;
    const isGlobal = toBoolean(req.body.isGlobal, "isGlobal");
    const notifyUsers = toBoolean(req.body.notifyUsers, "notifyUsers");
    const notificationDaysBefore = toNumber(
      req.body.notificationDaysBefore,
      "notificationDaysBefore"
    );
    const location = parseLocation(req.body.location);
    const rituals = parseRituals(req.body.rituals);
    const hasBodyUpdates =
      title !== undefined ||
      description !== undefined ||
      date !== undefined ||
      endDate !== undefined ||
      category !== undefined ||
      status !== undefined ||
      isGlobal !== undefined ||
      location !== undefined ||
      notifyUsers !== undefined ||
      notificationDaysBefore !== undefined ||
      rituals !== undefined;
    const hasImageUpdate = Boolean(req.file);

    if (!hasBodyUpdates && !hasImageUpdate) {
      throw new HttpError("Provide at least one field to update", 400);
    }

    if (title !== undefined) {
      festival.title = title;
    }

    if (description !== undefined) {
      festival.description = description;
    }

    if (date !== undefined) {
      festival.date = date;
    }

    if (endDate !== undefined) {
      festival.endDate = endDate;
    }

    if (category !== undefined) {
      festival.category = category;
    }

    if (status !== undefined) {
      festival.status = status;
    }

    if (isGlobal !== undefined) {
      festival.isGlobal = isGlobal;
    }

    if (location !== undefined) {
      festival.location = location;
    }

    if (notifyUsers !== undefined) {
      festival.notifyUsers = notifyUsers;
    }

    if (notificationDaysBefore !== undefined) {
      festival.notificationDaysBefore = notificationDaysBefore;
    }

    if (rituals !== undefined) {
      festival.rituals = rituals;
    }

    if (req.file) {
      const nextImage = await uploadFile(req.file, "festivals");
      const previousImage = festival.image;
      festival.image = nextImage;
      await deleteFile(previousImage).catch(() => {});
    }

    festival.status = "PENDING";
    festival.isVisible = false;
    festival.reviewedBy = undefined;
    festival.reviewedAt = undefined;

    await festival.save();
    await festival.populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(
      res,
      { festival },
      "Festival updated successfully and sent for approval"
    );
  } catch (error) {
    return next(error);
  }
};

const deleteFestival = async (req, res, next) => {
  try {
    const festival = await Festival.findOne({ _id: req.params.id, isDeleted: false });

    if (!festival) {
      throw new HttpError("Festival not found", 404);
    }

    if (!canModifyFestival(festival, req.user)) {
      throw new HttpError("You are not authorized to delete this festival", 403);
    }

    await deleteFile(festival.image).catch(() => {});
    festival.isDeleted = true;
    festival.isVisible = false;
    await festival.save();

    return sendSuccess(res, null, "Festival deleted successfully");
  } catch (error) {
    return next(error);
  }
};

const reviewFestival = async (req, res, next) => {
  try {
    const festival = await Festival.findOne({ _id: req.params.id, isDeleted: false });

    if (!festival) {
      throw new HttpError("Festival not found", 404);
    }

    const { status } = req.body;
    festival.status = status;
    festival.isVisible = status === "APPROVED";
    festival.reviewedBy = req.user.userId;
    festival.reviewedAt = new Date();

    await festival.save();
    await festival.populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(res, { festival }, "Festival reviewed successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createFestival,
  getMyFestivals,
  getAllFestivals,
  getVisibleFestivals,
  updateFestival,
  deleteFestival,
  reviewFestival,
};
