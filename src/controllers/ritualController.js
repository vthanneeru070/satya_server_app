const Ritual = require("../models/Ritual");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { uploadFile, deleteFile } = require("../services/s3Service");
const { mergeUploadedMediaSlot, orphanedUrls } = require("../utils/mediaReplace");
const { parseObjectIdArrayField } = require("../utils/objectIdArray");
const { mergeSearchFilter } = require("../utils/textSearch");

const RITUAL_SEARCH_FIELDS = ["title", "description", "category", "purpose"];

const getUploadedMediaUrls = async (files = {}) => ({
  images: await Promise.all((files.image || []).map((file) => uploadFile(file, "rituals"))),
  audio: await Promise.all((files.audio || []).map((file) => uploadFile(file, "rituals"))),
  videos: await Promise.all((files.video || []).map((file) => uploadFile(file, "rituals"))),
});

const parseJsonField = (value, fieldName) => {
  if (value === undefined) return undefined;
  if (typeof value === "object" && value !== null) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch (_e) {
      throw new HttpError(`${fieldName} must be a valid JSON object/array`, 400);
    }
  }
  throw new HttpError(`${fieldName} must be a valid JSON object/array`, 400);
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

const ritualPopulate = [
  { path: "deity", select: "name deity_color" },
  { path: "createdBy", select: "email role" },
];

const slugify = (str) =>
  String(str)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "ritual";

const ensureUniqueSlug = async (baseSlug, excludeId) => {
  for (let i = 0; i < 5000; i += 1) {
    const slug = i === 0 ? baseSlug : `${baseSlug}-${i}`;
    const q = { slug, isDeleted: false };
    if (excludeId) q._id = { $ne: excludeId };
    const exists = await Ritual.findOne(q).select("_id").lean();
    if (!exists) return slug;
  }
  throw new HttpError("Could not allocate unique slug", 500);
};

const resolvePricing = ({ accessType, price, currency }) => {
  const finalAccessType = accessType === "PAID" || accessType === "FREE" ? accessType : "FREE";
  const finalPrice =
    finalAccessType === "PAID" ? Number(price) : price === undefined ? 0 : Number(price);
  const finalCurrency =
    finalAccessType === "PAID"
      ? String(currency || "").trim()
      : (currency && String(currency).trim()) || "ZAR";

  if (finalAccessType === "PAID") {
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      throw new HttpError("price must be greater than 0 when accessType is PAID", 400);
    }
    if (!finalCurrency) {
      throw new HttpError("currency is required when accessType is PAID", 400);
    }
  }

  return { accessType: finalAccessType, price: finalPrice, currency: finalCurrency };
};

const notDeleted = { isDeleted: false };

const createRitual = async (req, res, next) => {
  try {
    const {
      title,
      slug: slugInput,
      description,
      deity,
      category,
      purpose,
      ritualDays,
      bestDayTime,
      startingDay,
      difficulty,
      accessType,
      price,
      currency,
      isFeatured,
      status: requestedStatus,
    } = req.body;

    const sections = parseJsonField(req.body.sections, "sections") ?? [];
    const days = parseJsonField(req.body.days, "days") ?? [];
    const mediaFromBody = parseJsonField(req.body.media, "media") || {};
    const deityIds = parseObjectIdArrayField(deity, "deity") ?? [];
    if (!deityIds.length) {
      throw new HttpError("deity must contain at least one valid ObjectId", 400);
    }

    const uploadedMedia = await getUploadedMediaUrls(req.files);
    const images = [...(mediaFromBody.images || []), ...uploadedMedia.images];
    const audio = [...(mediaFromBody.audio || []), ...uploadedMedia.audio];
    const videos = [...(mediaFromBody.videos || []), ...uploadedMedia.videos];

    const pricing = resolvePricing({ accessType, price, currency });
    const status = req.user.isSuperAdmin === true ? requestedStatus || "APPROVED" : "PENDING";

    const baseSlug = slugify(slugInput || title);
    const slug = await ensureUniqueSlug(baseSlug);

    const ritual = await Ritual.create({
      title,
      slug,
      description: description ?? "",
      deity: deityIds,
      category: category ?? "",
      purpose: purpose ?? "",
      ritualDays: Number(ritualDays),
      bestDayTime: bestDayTime ?? "",
      startingDay: startingDay ?? "",
      difficulty: difficulty || "BEGINNER",
      sections,
      days,
      images,
      audio,
      videos,
      accessType: pricing.accessType,
      price: pricing.price,
      currency: pricing.currency,
      isFeatured: Boolean(isFeatured),
      status,
      createdBy: req.user.userId,
    });

    await ritual.populate(ritualPopulate);

    return sendSuccess(res, { ritual }, "Ritual created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getRituals = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = { ...notDeleted };

    if (req.user?.role !== "admin") {
      filter.status = "APPROVED";
    } else if (req.query.status) {
      filter.status = req.query.status;
    }

    mergeSearchFilter(filter, RITUAL_SEARCH_FIELDS, req.query.search);

    const [rituals, total] = await Promise.all([
      Ritual.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(ritualPopulate),
      Ritual.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        rituals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Rituals fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const getAllRituals = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = { ...notDeleted };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    mergeSearchFilter(filter, RITUAL_SEARCH_FIELDS, req.query.search);

    const [rituals, total] = await Promise.all([
      Ritual.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(ritualPopulate),
      Ritual.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        rituals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "All rituals fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const getMyRituals = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = { createdBy: req.user.userId, ...notDeleted };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    mergeSearchFilter(filter, RITUAL_SEARCH_FIELDS, req.query.search);

    const [rituals, total] = await Promise.all([
      Ritual.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(ritualPopulate),
      Ritual.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        rituals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "My rituals fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const getRitualById = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, ...notDeleted };

    if (req.user?.role !== "admin") {
      filter.status = "APPROVED";
    }

    const ritual = await Ritual.findOne(filter).populate(ritualPopulate);

    if (!ritual) {
      throw new HttpError("Ritual not found", 404);
    }

    return sendSuccess(res, { ritual }, "Ritual fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const updateRitual = async (req, res, next) => {
  try {
    const ritual = await Ritual.findOne({ _id: req.params.id, ...notDeleted });

    if (!ritual) {
      throw new HttpError("Ritual not found", 404);
    }

    const {
      title,
      slug: slugInput,
      description,
      deity,
      category,
      purpose,
      ritualDays,
      bestDayTime,
      startingDay,
      difficulty,
      accessType,
      price,
      currency,
      isFeatured,
      status,
    } = req.body;

    const sections = req.body.sections !== undefined ? parseJsonField(req.body.sections, "sections") : undefined;
    const days = req.body.days !== undefined ? parseJsonField(req.body.days, "days") : undefined;
    const mediaFromBody = req.body.media !== undefined ? parseJsonField(req.body.media, "media") : undefined;
    const parsedDeityIds = parseObjectIdArrayField(deity, "deity");
    if (parsedDeityIds !== undefined && !parsedDeityIds.length) {
      throw new HttpError("deity must contain at least one valid ObjectId", 400);
    }

    const uploadedMedia = await getUploadedMediaUrls(req.files);
    const hasUploadedMedia =
      uploadedMedia.images.length > 0 ||
      uploadedMedia.audio.length > 0 ||
      uploadedMedia.videos.length > 0;

    const imagesFromBody = mediaFromBody?.images;
    const audioFromBody = mediaFromBody?.audio;
    const videosFromBody = mediaFromBody?.videos;

    const hasBodyUpdates =
      title !== undefined ||
      slugInput !== undefined ||
      description !== undefined ||
      parsedDeityIds !== undefined ||
      category !== undefined ||
      purpose !== undefined ||
      ritualDays !== undefined ||
      bestDayTime !== undefined ||
      startingDay !== undefined ||
      difficulty !== undefined ||
      sections !== undefined ||
      days !== undefined ||
      mediaFromBody !== undefined ||
      accessType !== undefined ||
      price !== undefined ||
      currency !== undefined ||
      isFeatured !== undefined ||
      status !== undefined;

    if (!hasBodyUpdates && !hasUploadedMedia) {
      throw new HttpError("Provide at least one field to update", 400);
    }

    if (title !== undefined) ritual.title = title;
    if (description !== undefined) ritual.description = description;
    if (parsedDeityIds !== undefined) ritual.deity = parsedDeityIds;
    if (category !== undefined) ritual.category = category;
    if (purpose !== undefined) ritual.purpose = purpose;
    if (ritualDays !== undefined) ritual.ritualDays = Number(ritualDays);
    if (bestDayTime !== undefined) ritual.bestDayTime = bestDayTime;
    if (startingDay !== undefined) ritual.startingDay = startingDay;
    if (difficulty !== undefined) ritual.difficulty = difficulty;
    if (sections !== undefined) ritual.sections = sections;
    if (days !== undefined) ritual.days = days;
    if (isFeatured !== undefined) ritual.isFeatured = Boolean(isFeatured);

    if (slugInput !== undefined) {
      const base = slugify(slugInput);
      ritual.slug = await ensureUniqueSlug(base, ritual._id);
    }

    if (status !== undefined && req.user.isSuperAdmin === true) {
      ritual.status = status;
    }

    if (accessType !== undefined || price !== undefined || currency !== undefined) {
      const pricing = resolvePricing({
        accessType: accessType !== undefined ? accessType : ritual.accessType,
        price: price !== undefined ? price : ritual.price,
        currency: currency !== undefined ? currency : ritual.currency,
      });
      ritual.accessType = pricing.accessType;
      ritual.price = pricing.price;
      ritual.currency = pricing.currency;
    }

    if (imagesFromBody !== undefined || uploadedMedia.images.length > 0) {
      const nextImages = mergeUploadedMediaSlot(
        ritual.images,
        imagesFromBody,
        uploadedMedia.images
      );
      const orphans = orphanedUrls(ritual.images, nextImages);
      ritual.images = nextImages;
      if (orphans.length) {
        await Promise.all(orphans.map((url) => deleteFile(url).catch(() => {})));
      }
    }
    if (audioFromBody !== undefined || uploadedMedia.audio.length > 0) {
      const nextAudio = mergeUploadedMediaSlot(
        ritual.audio,
        audioFromBody,
        uploadedMedia.audio
      );
      const orphans = orphanedUrls(ritual.audio, nextAudio);
      ritual.audio = nextAudio;
      if (orphans.length) {
        await Promise.all(orphans.map((url) => deleteFile(url).catch(() => {})));
      }
    }
    if (videosFromBody !== undefined || uploadedMedia.videos.length > 0) {
      const nextVideos = mergeUploadedMediaSlot(
        ritual.videos,
        videosFromBody,
        uploadedMedia.videos
      );
      const orphans = orphanedUrls(ritual.videos, nextVideos);
      ritual.videos = nextVideos;
      if (orphans.length) {
        await Promise.all(orphans.map((url) => deleteFile(url).catch(() => {})));
      }
    }

    if (req.user.isSuperAdmin !== true) {
      ritual.status = "PENDING";
    }

    await ritual.save();
    await ritual.populate(ritualPopulate);

    return sendSuccess(res, { ritual }, "Ritual updated successfully");
  } catch (error) {
    return next(error);
  }
};

const reviewRitual = async (req, res, next) => {
  try {
    const ritual = await Ritual.findOne({ _id: req.params.id, ...notDeleted });

    if (!ritual) {
      throw new HttpError("Ritual not found", 404);
    }

    ritual.status = req.body.status;
    await ritual.save();
    await ritual.populate(ritualPopulate);

    return sendSuccess(res, { ritual }, "Ritual reviewed successfully");
  } catch (error) {
    return next(error);
  }
};

const deleteRitual = async (req, res, next) => {
  try {
    const ritual = await Ritual.findOne({ _id: req.params.id, ...notDeleted });

    if (!ritual) {
      throw new HttpError("Ritual not found", 404);
    }

    await Promise.all([
      ...(ritual.images || []).map((url) => deleteFile(url).catch(() => {})),
      ...(ritual.audio || []).map((url) => deleteFile(url).catch(() => {})),
      ...(ritual.videos || []).map((url) => deleteFile(url).catch(() => {})),
    ]);

    await ritual.deleteOne();

    return sendSuccess(res, null, "Ritual deleted successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createRitual,
  getRituals,
  getAllRituals,
  getMyRituals,
  getRitualById,
  updateRitual,
  deleteRitual,
  reviewRitual,
};
