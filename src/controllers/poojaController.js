const Pooja = require("../models/Pooja");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { uploadFile, deleteFile } = require("../services/s3Service");

const getUploadedMediaUrls = async (files = {}) => ({
  images: await Promise.all((files.image || []).map((file) => uploadFile(file, "general"))),
  audio: await Promise.all((files.audio || []).map((file) => uploadFile(file, "general"))),
  videos: await Promise.all((files.video || []).map((file) => uploadFile(file, "general"))),
});

const parseStringArrayField = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmedValue);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_error) {
      // Keep handling as plain string below
    }

    if (trimmedValue.includes(",")) {
      return trimmedValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [trimmedValue];
  }

  throw new HttpError(`${fieldName} must be an array or JSON array string`, 400);
};

const parseObjectIdArrayField = (value, fieldName) => {
  const parsed = parseStringArrayField(value, fieldName);
  if (parsed === undefined) {
    return undefined;
  }

  const objectIdRegex = /^[a-fA-F0-9]{24}$/;
  const invalidId = parsed.find((id) => !objectIdRegex.test(String(id).trim()));
  if (invalidId) {
    throw new HttpError(`${fieldName} must contain valid ObjectId values`, 400);
  }

  return parsed.map((id) => String(id).trim());
};

const parseJsonField = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "object" && value !== null) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      throw new HttpError(`${fieldName} must be a valid JSON object/array`, 400);
    }
  }

  throw new HttpError(`${fieldName} must be a valid JSON object/array`, 400);
};

const createPooja = async (req, res, next) => {
  try {
    const {
      title,
      deity,
      category,
      difficulty,
      duration,
      description,
      blessings,
      status: requestedStatus,
      festivalIds: festivalIdsRaw,
      rating,
    } = req.body;
    const purpose = parseJsonField(req.body.purpose, "purpose");
    const deitySummary = parseJsonField(req.body.deitySummary, "deitySummary");
    const preparation = parseJsonField(req.body.preparation, "preparation");
    const steps = parseJsonField(req.body.steps, "steps") ?? [];
    const mantra = parseJsonField(req.body.mantra, "mantra");
    const spiritualMeaning = parseJsonField(req.body.spiritualMeaning, "spiritualMeaning");
    const guidance = parseJsonField(req.body.guidance, "guidance");
    const completion = parseJsonField(req.body.completion, "completion");
    const mediaFromBody = parseJsonField(req.body.media, "media") || {};
    const festivalIds = parseObjectIdArrayField(festivalIdsRaw, "festivalIds") ?? [];
    const uploadedMedia = await getUploadedMediaUrls(req.files);
    const media = {
      images: [...(mediaFromBody.images || []), ...uploadedMedia.images],
      audio: [...(mediaFromBody.audio || []), ...uploadedMedia.audio],
      videos: [...(mediaFromBody.videos || []), ...uploadedMedia.videos],
    };
    const status = req.user.isSuperAdmin === true ? requestedStatus || "APPROVED" : "PENDING";

    const pooja = await Pooja.create({
      title,
      deity,
      category,
      difficulty,
      duration,
      description,
      purpose,
      deitySummary,
      preparation,
      steps,
      mantra,
      spiritualMeaning,
      guidance,
      completion,
      media,
      status,
      festivalIds,
      blessings,
      rating,
      createdBy: req.user.userId,
    });

    return sendSuccess(res, { pooja }, "Pooja created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getPoojas = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.user?.role !== "admin") {
      filter.status = "APPROVED";
    } else if (req.query.status) {
      filter.status = req.query.status;
    }

    const [poojas, total] = await Promise.all([
      Pooja.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "email role"),
      Pooja.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        poojas,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Poojas fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const getAllPoojas = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [poojas, total] = await Promise.all([
      Pooja.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "email role"),
      Pooja.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        poojas,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "All poojas fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const getMyPoojas = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = { createdBy: req.user.userId };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [poojas, total] = await Promise.all([
      Pooja.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "email role"),
      Pooja.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        poojas,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "My poojas fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const getPoojaById = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };

    if (req.user?.role !== "admin") {
      filter.status = "APPROVED";
    }

    const pooja = await Pooja.findOne(filter).populate("createdBy", "email role");

    if (!pooja) {
      throw new HttpError("Pooja not found", 404);
    }

    return sendSuccess(res, { pooja }, "Pooja fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const updatePooja = async (req, res, next) => {
  try {
    const pooja = await Pooja.findById(req.params.id);

    if (!pooja) {
      throw new HttpError("Pooja not found", 404);
    }

    const {
      title,
      deity,
      category,
      difficulty,
      duration,
      description,
      blessings,
      status,
      festivalIds: festivalIdsRaw,
      rating,
    } = req.body;
    const purpose = parseJsonField(req.body.purpose, "purpose");
    const deitySummary = parseJsonField(req.body.deitySummary, "deitySummary");
    const preparation = parseJsonField(req.body.preparation, "preparation");
    const steps = parseJsonField(req.body.steps, "steps");
    const mantra = parseJsonField(req.body.mantra, "mantra");
    const spiritualMeaning = parseJsonField(req.body.spiritualMeaning, "spiritualMeaning");
    const guidance = parseJsonField(req.body.guidance, "guidance");
    const completion = parseJsonField(req.body.completion, "completion");
    const mediaFromBody = parseJsonField(req.body.media, "media");
    const festivalIds = parseObjectIdArrayField(festivalIdsRaw, "festivalIds");
    const uploadedMedia = await getUploadedMediaUrls(req.files);
    const hasUploadedMedia =
      uploadedMedia.images.length > 0 || uploadedMedia.audio.length > 0 || uploadedMedia.videos.length > 0;
    const hasBodyUpdates =
      title !== undefined ||
      deity !== undefined ||
      category !== undefined ||
      difficulty !== undefined ||
      duration !== undefined ||
      description !== undefined ||
      purpose !== undefined ||
      deitySummary !== undefined ||
      preparation !== undefined ||
      status !== undefined ||
      mantra !== undefined ||
      spiritualMeaning !== undefined ||
      guidance !== undefined ||
      completion !== undefined ||
      mediaFromBody !== undefined ||
      blessings !== undefined ||
      rating !== undefined ||
      steps !== undefined ||
      festivalIds !== undefined;
    const hasMediaUpdate = hasUploadedMedia;

    if (!hasBodyUpdates && !hasMediaUpdate) {
      throw new HttpError("Provide at least one field to update", 400);
    }

    if (title !== undefined) {
      pooja.title = title;
    }

    if (deity !== undefined) {
      pooja.deity = deity;
    }

    if (category !== undefined) {
      pooja.category = category;
    }

    if (difficulty !== undefined) {
      pooja.difficulty = difficulty;
    }

    if (duration !== undefined) {
      pooja.duration = duration;
    }

    if (description !== undefined) {
      pooja.description = description;
    }

    if (purpose !== undefined) {
      pooja.purpose = purpose;
    }

    if (deitySummary !== undefined) {
      pooja.deitySummary = deitySummary;
    }

    if (preparation !== undefined) {
      pooja.preparation = preparation;
    }

    if (status !== undefined) {
      if (req.user.isSuperAdmin === true) {
        pooja.status = status;
      }
    }

    if (steps !== undefined) {
      pooja.steps = steps;
    }

    if (mantra !== undefined) {
      pooja.mantra = mantra;
    }

    if (spiritualMeaning !== undefined) {
      pooja.spiritualMeaning = spiritualMeaning;
    }

    if (guidance !== undefined) {
      pooja.guidance = guidance;
    }

    if (completion !== undefined) {
      pooja.completion = completion;
    }

    if (blessings !== undefined) {
      pooja.blessings = parseStringArrayField(blessings, "blessings");
    }

    if (festivalIds !== undefined) {
      pooja.festivalIds = festivalIds;
    }

    if (rating !== undefined) {
      pooja.rating = rating;
    }

    if (mediaFromBody !== undefined || hasUploadedMedia) {
      const currentMedia = pooja.media || { images: [], audio: [], videos: [] };
      pooja.media = {
        images: [
          ...((mediaFromBody && mediaFromBody.images) || currentMedia.images || []),
          ...uploadedMedia.images,
        ],
        audio: [...((mediaFromBody && mediaFromBody.audio) || currentMedia.audio || []), ...uploadedMedia.audio],
        videos: [
          ...((mediaFromBody && mediaFromBody.videos) || currentMedia.videos || []),
          ...uploadedMedia.videos,
        ],
      };
    }

    if (req.user.isSuperAdmin !== true) {
      pooja.status = "PENDING";
    }

    await pooja.save();
    await pooja.populate("createdBy", "email role");

    return sendSuccess(res, { pooja }, "Pooja updated successfully");
  } catch (error) {
    return next(error);
  }
};

const reviewPooja = async (req, res, next) => {
  try {
    const pooja = await Pooja.findById(req.params.id);

    if (!pooja) {
      throw new HttpError("Pooja not found", 404);
    }

    pooja.status = req.body.status;
    await pooja.save();
    await pooja.populate("createdBy", "email role");

    return sendSuccess(res, { pooja }, "Pooja reviewed successfully");
  } catch (error) {
    return next(error);
  }
};

const deletePooja = async (req, res, next) => {
  try {
    const pooja = await Pooja.findById(req.params.id);

    if (!pooja) {
      throw new HttpError("Pooja not found", 404);
    }

    await Promise.all([
      ...((pooja.media?.images || []).map((url) => deleteFile(url).catch(() => {}))),
      ...((pooja.media?.audio || []).map((url) => deleteFile(url).catch(() => {}))),
      ...((pooja.media?.videos || []).map((url) => deleteFile(url).catch(() => {}))),
    ]);
    await pooja.deleteOne();

    return sendSuccess(res, null, "Pooja deleted successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPooja,
  getPoojas,
  getAllPoojas,
  getMyPoojas,
  getPoojaById,
  updatePooja,
  deletePooja,
  reviewPooja,
};
