const Deity = require("../models/Deity");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { uploadFile, deleteFile } = require("../services/s3Service");
const { mergeSearchFilter } = require("../utils/textSearch");

const DEITY_SEARCH_FIELDS = ["name", "description", "alternate_names", "roles"];

const getUploadedMediaUrls = async (files = {}) => ({
  images: await Promise.all((files.image || []).map((file) => uploadFile(file, "deities"))),
  audio: await Promise.all((files.audio || []).map((file) => uploadFile(file, "deities"))),
  videos: await Promise.all((files.video || []).map((file) => uploadFile(file, "deities"))),
});

const parseStringArrayField = (value, fieldName) => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch (_error) {
      // fall through
    }

    if (trimmed.includes(",")) {
      return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [trimmed];
  }

  throw new HttpError(`${fieldName} must be an array or JSON array string`, 400);
};

const parseObjectIdArrayField = (value, fieldName) => {
  const parsed = parseStringArrayField(value, fieldName);
  if (parsed === undefined) return undefined;

  const objectIdRegex = /^[a-fA-F0-9]{24}$/;
  const invalidId = parsed.find((id) => !objectIdRegex.test(String(id).trim()));
  if (invalidId) {
    throw new HttpError(`${fieldName} must contain valid ObjectId values`, 400);
  }
  return parsed.map((id) => String(id).trim());
};

const parseJsonField = (value, fieldName) => {
  if (value === undefined) return undefined;
  if (typeof value === "object" && value !== null) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      throw new HttpError(`${fieldName} must be a valid JSON object/array`, 400);
    }
  }

  throw new HttpError(`${fieldName} must be a valid JSON object/array`, 400);
};

const buildDeityPayloadFromRequest = async (req) => {
  const body = req.body || {};

  const alternateNames = parseStringArrayField(body.alternate_names, "alternate_names");
  const roles = parseStringArrayField(body.roles, "roles");
  const lineage = parseJsonField(body.lineage, "lineage");
  const structure = parseJsonField(body.structure, "structure");
  const appearance = parseJsonField(body.appearance, "appearance");
  const spiritualSignificance = parseJsonField(body.spiritual_significance, "spiritual_significance");
  const connecting = parseJsonField(body.connecting, "connecting");
  const chanting = parseJsonField(body.chanting, "chanting");
  const homePractice = parseJsonField(body.home_practice, "home_practice");
  const devotionalExperience = parseJsonField(body.devotional_experience, "devotional_experience");
  const stories = parseJsonField(body.stories, "stories");
  const pujas =
    body.pujas !== undefined ? parseObjectIdArrayField(body.pujas, "pujas") : undefined;
  const mediaFromBody = parseJsonField(body.media, "media");

  const uploadedMedia = await getUploadedMediaUrls(req.files);
  const hasUploadedMedia =
    uploadedMedia.images.length > 0 ||
    uploadedMedia.audio.length > 0 ||
    uploadedMedia.videos.length > 0;

  return {
    body,
    parsed: {
      alternateNames,
      roles,
      lineage,
      structure,
      appearance,
      spiritualSignificance,
      connecting,
      chanting,
      homePractice,
      devotionalExperience,
      stories,
      pujas,
      mediaFromBody,
    },
    uploadedMedia,
    hasUploadedMedia,
  };
};

const createDeity = async (req, res, next) => {
  try {
    const { body, parsed, uploadedMedia } = await buildDeityPayloadFromRequest(req);

    const media = {
      images: [...((parsed.mediaFromBody && parsed.mediaFromBody.images) || []), ...uploadedMedia.images],
      audio: [...((parsed.mediaFromBody && parsed.mediaFromBody.audio) || []), ...uploadedMedia.audio],
      videos: [...((parsed.mediaFromBody && parsed.mediaFromBody.videos) || []), ...uploadedMedia.videos],
    };

    const status = req.user.isSuperAdmin === true ? body.status || "APPROVED" : "PENDING";

    const deity = await Deity.create({
      name: body.name,
      description: body.description,
      ...(body.deity_color !== undefined && { deity_color: body.deity_color }),
      ...(parsed.alternateNames !== undefined && { alternate_names: parsed.alternateNames }),
      ...(parsed.roles !== undefined && { roles: parsed.roles }),
      ...(parsed.lineage !== undefined && { lineage: parsed.lineage }),
      ...(parsed.structure !== undefined && { structure: parsed.structure }),
      ...(parsed.appearance !== undefined && { appearance: parsed.appearance }),
      ...(parsed.spiritualSignificance !== undefined && { spiritual_significance: parsed.spiritualSignificance }),
      ...(parsed.connecting !== undefined && { connecting: parsed.connecting }),
      ...(parsed.chanting !== undefined && { chanting: parsed.chanting }),
      ...(parsed.homePractice !== undefined && { home_practice: parsed.homePractice }),
      ...(parsed.devotionalExperience !== undefined && { devotional_experience: parsed.devotionalExperience }),
      ...(parsed.stories !== undefined && { stories: parsed.stories }),
      ...(parsed.pujas !== undefined && { pujas: parsed.pujas }),
      media,
      status,
      createdBy: req.user.userId,
    });

    return sendSuccess(res, { deity }, "Deity created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

//Only approved deities
const getDeities = async (req, res, next) => {
  const deities = await Deity.find({ status: "APPROVED" })
    .populate("createdBy", "email role")
    .populate("pujas", "title");

  return sendSuccess(res, { deities }, "Deities fetched successfully");
};

const getAllDeities = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    mergeSearchFilter(filter, DEITY_SEARCH_FIELDS, req.query.search);

    const [deities, total] = await Promise.all([
      Deity.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "email role")
        .populate("pujas", "title"),
      Deity.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        deities,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Deities fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const getDeityById = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    const isAdmin = req.user?.role === "admin";
    const isSuperAdmin = req.user?.isSuperAdmin === true;

    if (!isAdmin && !isSuperAdmin) {
      filter.status = "APPROVED";
    }

    const deity = await Deity.findOne(filter)
      .populate("createdBy", "email role")
      .populate("pujas", "title");

    if (!deity) {
      throw new HttpError("Deity not found", 404);
    }

    return sendSuccess(res, { deity }, "Deity fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const updateDeity = async (req, res, next) => {
  try {
    const deity = await Deity.findById(req.params.id);
    if (!deity) {
      throw new HttpError("Deity not found", 404);
    }

    const { body, parsed, uploadedMedia, hasUploadedMedia } = await buildDeityPayloadFromRequest(req);

    const hasBodyUpdates =
      body.name !== undefined ||
      body.description !== undefined ||
      body.deity_color !== undefined ||
      body.status !== undefined ||
      parsed.alternateNames !== undefined ||
      parsed.roles !== undefined ||
      parsed.lineage !== undefined ||
      parsed.structure !== undefined ||
      parsed.appearance !== undefined ||
      parsed.spiritualSignificance !== undefined ||
      parsed.connecting !== undefined ||
      parsed.chanting !== undefined ||
      parsed.homePractice !== undefined ||
      parsed.devotionalExperience !== undefined ||
      parsed.stories !== undefined ||
      parsed.pujas !== undefined ||
      parsed.mediaFromBody !== undefined;

    if (!hasBodyUpdates && !hasUploadedMedia) {
      throw new HttpError("Provide at least one field to update", 400);
    }

    if (body.name !== undefined) deity.name = body.name;
    if (body.description !== undefined) deity.description = body.description;
    if (body.deity_color !== undefined) deity.deity_color = body.deity_color;
    if (parsed.alternateNames !== undefined) deity.alternate_names = parsed.alternateNames;
    if (parsed.roles !== undefined) deity.roles = parsed.roles;
    if (parsed.lineage !== undefined) deity.lineage = parsed.lineage;
    if (parsed.structure !== undefined) deity.structure = parsed.structure;
    if (parsed.appearance !== undefined) deity.appearance = parsed.appearance;
    if (parsed.spiritualSignificance !== undefined) deity.spiritual_significance = parsed.spiritualSignificance;
    if (parsed.connecting !== undefined) deity.connecting = parsed.connecting;
    if (parsed.chanting !== undefined) deity.chanting = parsed.chanting;
    if (parsed.homePractice !== undefined) deity.home_practice = parsed.homePractice;
    if (parsed.devotionalExperience !== undefined) deity.devotional_experience = parsed.devotionalExperience;
    if (parsed.stories !== undefined) deity.stories = parsed.stories;
    if (parsed.pujas !== undefined) deity.pujas = parsed.pujas;

    if (body.status !== undefined && req.user.isSuperAdmin === true) {
      deity.status = body.status;
    }

    if (parsed.mediaFromBody !== undefined || hasUploadedMedia) {
      const currentMedia = deity.media || { images: [], audio: [], videos: [] };
      const mediaFromBody = parsed.mediaFromBody;
      deity.media = {
        images: [
          ...((mediaFromBody && mediaFromBody.images) || currentMedia.images || []),
          ...uploadedMedia.images,
        ],
        audio: [
          ...((mediaFromBody && mediaFromBody.audio) || currentMedia.audio || []),
          ...uploadedMedia.audio,
        ],
        videos: [
          ...((mediaFromBody && mediaFromBody.videos) || currentMedia.videos || []),
          ...uploadedMedia.videos,
        ],
      };
    }

    if (req.user.isSuperAdmin !== true) {
      deity.status = "PENDING";
    }

    await deity.save();
    await deity.populate("createdBy", "email role");
    await deity.populate("pujas", "title");

    return sendSuccess(res, { deity }, "Deity updated successfully");
  } catch (error) {
    return next(error);
  }
};

const deleteDeity = async (req, res, next) => {
  try {
    const deity = await Deity.findById(req.params.id);
    if (!deity) {
      throw new HttpError("Deity not found", 404);
    }

    await Promise.all([
      ...((deity.media?.images || []).map((url) => deleteFile(url).catch(() => {}))),
      ...((deity.media?.audio || []).map((url) => deleteFile(url).catch(() => {}))),
      ...((deity.media?.videos || []).map((url) => deleteFile(url).catch(() => {}))),
    ]);

    await deity.deleteOne();

    return sendSuccess(res, null, "Deity deleted successfully");
  } catch (error) {
    return next(error);
  }
};

const reviewDeity = async (req, res, next) => {
  try {
    const deity = await Deity.findById(req.params.id)
      .populate("createdBy", "email role")
      .populate("pujas", "title");

    if (!deity) {
      throw new HttpError("Deity not found", 404);
    }

    deity.status = req.body.status;
    await deity.save();

    return sendSuccess(res, { deity }, "Deity reviewed successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createDeity,
  getDeities,
  getAllDeities,
  getDeityById,
  updateDeity,
  deleteDeity,
  reviewDeity,
};
