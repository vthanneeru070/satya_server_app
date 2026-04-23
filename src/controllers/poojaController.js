const Pooja = require("../models/Pooja");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { uploadFile, deleteFile } = require("../services/s3Service");

const getUploadedMediaUrls = async (files = {}) => {
  const imageFile = files.image?.[0];
  const audioFile = files.audio?.[0];
  const videoFile = files.video?.[0];

  return {
    imageUrl: imageFile ? await uploadFile(imageFile, "general") : undefined,
    audioUrl: audioFile ? await uploadFile(audioFile, "general") : undefined,
    videoUrl: videoFile ? await uploadFile(videoFile, "general") : undefined,
  };
};

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

const createPooja = async (req, res, next) => {
  try {
    const {
      title,
      deity,
      category,
      difficulty,
      duration,
      description,
      status: requestedStatus,
      audioUrl: audioUrlFromBody,
      videoUrl: videoUrlFromBody,
      festivalIds: festivalIdsRaw,
      rating,
    } = req.body;
    const steps = parseStringArrayField(req.body.steps, "steps") ?? [];
    const requiredItems = parseStringArrayField(req.body.requiredItems, "requiredItems") ?? [];
    const festivalIds = parseObjectIdArrayField(festivalIdsRaw, "festivalIds") ?? [];
    const { imageUrl, audioUrl: audioFileUrl, videoUrl: videoFileUrl } = await getUploadedMediaUrls(
      req.files
    );
    const audioUrl = audioFileUrl ?? audioUrlFromBody;
    const videoUrl = videoFileUrl ?? videoUrlFromBody;
    const status = req.user.isSuperAdmin === true ? requestedStatus || "APPROVED" : "PENDING";

    const pooja = await Pooja.create({
      title,
      deity,
      category,
      difficulty,
      duration,
      description,
      status,
      imageUrl,
      audioUrl,
      videoUrl,
      steps,
      requiredItems,
      festivalIds,
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
      status,
      audioUrl: audioUrlFromBody,
      videoUrl: videoUrlFromBody,
      festivalIds: festivalIdsRaw,
      rating,
    } = req.body;
    const steps = parseStringArrayField(req.body.steps, "steps");
    const requiredItems = parseStringArrayField(req.body.requiredItems, "requiredItems");
    const festivalIds = parseObjectIdArrayField(festivalIdsRaw, "festivalIds");
    const {
      imageUrl: imageFileUrl,
      audioUrl: audioFileUrl,
      videoUrl: videoFileUrl,
    } = await getUploadedMediaUrls(req.files);
    const audioUrl = audioFileUrl ?? audioUrlFromBody;
    const videoUrl = videoFileUrl ?? videoUrlFromBody;
    const hasBodyUpdates =
      title !== undefined ||
      deity !== undefined ||
      category !== undefined ||
      difficulty !== undefined ||
      duration !== undefined ||
      description !== undefined ||
      status !== undefined ||
      audioUrl !== undefined ||
      videoUrl !== undefined ||
      rating !== undefined ||
      steps !== undefined ||
      requiredItems !== undefined ||
      festivalIds !== undefined;
    const hasMediaUpdate = Boolean(imageFileUrl || audioFileUrl || videoFileUrl);

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

    if (status !== undefined) {
      if (req.user.isSuperAdmin === true) {
        pooja.status = status;
      }
    }

    if (audioUrl !== undefined) {
      pooja.audioUrl = audioUrl;
    }

    if (videoUrl !== undefined) {
      pooja.videoUrl = videoUrl;
    }

    if (steps !== undefined) {
      pooja.steps = steps;
    }

    if (requiredItems !== undefined) {
      pooja.requiredItems = requiredItems;
    }

    if (festivalIds !== undefined) {
      pooja.festivalIds = festivalIds;
    }

    if (rating !== undefined) {
      pooja.rating = rating;
    }

    if (imageFileUrl) {
      const previousImageUrl = pooja.imageUrl;
      pooja.imageUrl = imageFileUrl;
      await deleteFile(previousImageUrl).catch(() => {});
    }

    if (audioFileUrl) {
      const previousAudioUrl = pooja.audioUrl;
      pooja.audioUrl = audioFileUrl;
      await deleteFile(previousAudioUrl).catch(() => {});
    }

    if (videoFileUrl) {
      const previousVideoUrl = pooja.videoUrl;
      pooja.videoUrl = videoFileUrl;
      await deleteFile(previousVideoUrl).catch(() => {});
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
      deleteFile(pooja.imageUrl).catch(() => {}),
      deleteFile(pooja.audioUrl).catch(() => {}),
      deleteFile(pooja.videoUrl).catch(() => {}),
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
