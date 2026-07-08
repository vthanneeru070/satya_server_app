const Pooja = require("../models/Pooja");
const Deity = require("../models/Deity");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { uploadFile, deleteFile } = require("../services/s3Service");
const {
  normalizeObjectIdArray,
  parseObjectIdArrayField,
} = require("../utils/objectIdArray");
const { mergeSearchFilter } = require("../utils/textSearch");
const { resolveDailyFlag, normalizeBoolean } = require("../utils/poojaDaily");

const POOJA_SEARCH_FIELDS = ["title", "description", "category"];

const getUploadedMediaUrls = async (files = {}) => ({
  images: await Promise.all((files.image || []).map((file) => uploadFile(file, "general"))),
  audio: await Promise.all((files.audio || []).map((file) => uploadFile(file, "general"))),
  videos: await Promise.all((files.video || []).map((file) => uploadFile(file, "general"))),
});

const normalizeSteps = (steps) => {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => ({
    stepNumber: Number(step.stepNumber),
    title: step.title ?? "",
    description: step.description ?? "",
    subSteps: Array.isArray(step.subSteps) ? step.subSteps : [],
    images: Array.isArray(step.images)
      ? step.images.map((url) => String(url).trim()).filter(Boolean)
      : [],
  }));
};

const collectStepImageUrls = (steps = []) =>
  normalizeSteps(steps).flatMap((step) => step.images || []);

const removedStepImageUrls = (previousSteps = [], nextSteps = []) => {
  const nextUrls = new Set(collectStepImageUrls(nextSteps));
  return collectStepImageUrls(previousSteps).filter((url) => !nextUrls.has(url));
};

const mergeStepImageUploads = async (steps, files = [], stepImageMetaRaw) => {
  const normalized = normalizeSteps(steps);
  const stepFiles = files || [];

  if (!stepFiles.length) {
    return normalized;
  }

  const meta = parseJsonField(stepImageMetaRaw, "stepImageMeta");
  if (!Array.isArray(meta) || meta.length !== stepFiles.length) {
    throw new HttpError(
      "stepImageMeta must be a JSON array with one { stepNumber } entry per stepImage file",
      400
    );
  }

  const uploaded = await Promise.all(stepFiles.map((file) => uploadFile(file, "poojas")));

  meta.forEach((entry, index) => {
    const stepNumber = Number(entry?.stepNumber);
    if (!Number.isFinite(stepNumber) || stepNumber < 1) {
      throw new HttpError("Each stepImageMeta entry must include a valid stepNumber", 400);
    }

    const step = normalized.find((row) => Number(row.stepNumber) === stepNumber);
    if (!step) {
      throw new HttpError(`Step ${stepNumber} not found for stepImage upload`, 400);
    }

    step.images.push(uploaded[index]);
  });

  return normalized;
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

const parseDdMmYyyyDate = (value, fieldName) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }

  const [day, month, year] = String(value).split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCDate() !== day ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCFullYear() !== year
  ) {
    throw new HttpError(`${fieldName} must be a valid date in dd-mm-yyyy format`, 400);
  }

  return parsedDate;
};

const resolveSchedulesInput = (body) => {
  if (body.schedules !== undefined) return body.schedules;
  if (body.date !== undefined) return body.date;
  return undefined;
};

const parseSchedules = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }

  let items;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (/^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4}$/.test(trimmed)) {
      items = [{ date: trimmed, time: "" }];
    } else {
      const parsed = parseJsonField(trimmed, fieldName);
      items = Array.isArray(parsed) ? parsed : [parsed];
    }
  } else if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === "object" && value !== null) {
    items = [value];
  } else {
    throw new HttpError(`${fieldName} must be a schedule array or JSON array string`, 400);
  }

  return items.map((slot, index) => {
    const label = `${fieldName}[${index}]`;
    const rawDate = slot?.date;
    if (rawDate === undefined || rawDate === null || String(rawDate).trim() === "") {
      throw new HttpError(`${label}.date is required`, 400);
    }

    const parsedDate =
      rawDate instanceof Date ? rawDate : parseDdMmYyyyDate(String(rawDate), `${label}.date`);

    return {
      date: parsedDate,
      time: String(slot?.time ?? "").trim(),
    };
  });
};

const syncDeityPujas = async (poojaId, previousDeityIds, nextDeityIds) => {
  const previous = new Set(normalizeObjectIdArray(previousDeityIds));
  const next = new Set(normalizeObjectIdArray(nextDeityIds));
  const removed = [...previous].filter((id) => !next.has(id));
  const added = [...next].filter((id) => !previous.has(id));

  await Promise.all([
    ...removed.map((id) => Deity.findByIdAndUpdate(id, { $pull: { pujas: poojaId } })),
    ...added.map((id) => Deity.findByIdAndUpdate(id, { $addToSet: { pujas: poojaId } })),
  ]);
};

const poojaPopulate = [
  { path: "createdBy", select: "email role" },
  { path: "deity", select: "name deity_color" },
];

// Normalize the trio (accessType, price, currency) into final, persistable values
// and enforce the cross-field rule: PAID poojas must have a positive price and a
// non-empty currency. Used by both create and update.
const resolvePricing = ({ accessType, price, currency }) => {
  const finalAccessType =
    accessType === "PAID" || accessType === "FREE" ? accessType : "FREE";
  const finalPrice =
    finalAccessType === "PAID"
      ? Number(price)
      : price === undefined
        ? 0
        : Number(price);
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

const createPooja = async (req, res, next) => {
  try {
    const {
      title,
      deity,
      category,
      difficulty,
      duration,
      ideal_time: idealTimeRaw,
      description,
      blessings,
      accessType,
      price,
      currency,
      status: requestedStatus,
      festivalIds: festivalIdsRaw,
      rating,
    } = req.body;
    const purpose = parseJsonField(req.body.purpose, "purpose");
    const parsedSchedules = parseSchedules(resolveSchedulesInput(req.body), "schedules");
    const deityIds = parseObjectIdArrayField(deity, "deity") ?? [];
    if (!deityIds.length) {
      throw new HttpError("deity must contain at least one valid ObjectId", 400);
    }
    const deitySummary = parseJsonField(req.body.deitySummary, "deitySummary");
    const preparation = parseJsonField(req.body.preparation, "preparation");
    const parsedSteps = parseJsonField(req.body.steps, "steps") ?? [];
    const steps = await mergeStepImageUploads(
      parsedSteps,
      req.files?.stepImage || [],
      req.body.stepImageMeta
    );
    const mantra = parseJsonField(req.body.mantra, "mantra");
    const spiritualMeaning = parseJsonField(req.body.spiritualMeaning, "spiritualMeaning");
    const guidance = parseJsonField(req.body.guidance, "guidance");
    const completion = parseJsonField(req.body.completion, "completion");
    const mediaFromBody = parseJsonField(req.body.media, "media") || {};
    const parsedBlessings = parseStringArrayField(blessings, "blessings");
    const parsedIdealTime = parseStringArrayField(idealTimeRaw, "ideal_time");
    const festivalIds = parseObjectIdArrayField(festivalIdsRaw, "festivalIds") ?? [];
    const uploadedMedia = await getUploadedMediaUrls(req.files);
    const media = {
      images: [...(mediaFromBody.images || []), ...uploadedMedia.images],
      audio: [...(mediaFromBody.audio || []), ...uploadedMedia.audio],
      videos: [...(mediaFromBody.videos || []), ...uploadedMedia.videos],
    };
    const pricing = resolvePricing({ accessType, price, currency });
    const status = req.user.isSuperAdmin === true ? requestedStatus || "APPROVED" : "PENDING";
    const daily = resolveDailyFlag({ daily: req.body.daily, category });

    const pooja = await Pooja.create({
      title,
      schedules: parsedSchedules ?? [],
      deity: deityIds,
      category,
      daily,
      difficulty,
      duration,
      ideal_time: parsedIdealTime ?? [],
      description,
      accessType: pricing.accessType,
      price: pricing.price,
      currency: pricing.currency,
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
      blessings: parsedBlessings ?? [],
      rating,
      createdBy: req.user.userId,
    });

    // Keep Deity.pujas in sync with linked pooja
    await syncDeityPujas(pooja._id, [], deityIds);

    await pooja.populate(poojaPopulate);

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

    mergeSearchFilter(filter, POOJA_SEARCH_FIELDS, req.query.search);

    if (req.query.daily !== undefined) {
      const dailyFilter = normalizeBoolean(req.query.daily);
      if (dailyFilter !== undefined) {
        filter.daily = dailyFilter;
      }
    }

    const [poojas, total] = await Promise.all([
      Pooja.find(filter)
        .sort({ daily: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(poojaPopulate),
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

    mergeSearchFilter(filter, POOJA_SEARCH_FIELDS, req.query.search);

    if (req.query.daily !== undefined) {
      const dailyFilter = normalizeBoolean(req.query.daily);
      if (dailyFilter !== undefined) {
        filter.daily = dailyFilter;
      }
    }

    const [poojas, total] = await Promise.all([
      Pooja.find(filter)
        .sort({ daily: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(poojaPopulate),
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

    mergeSearchFilter(filter, POOJA_SEARCH_FIELDS, req.query.search);

    if (req.query.daily !== undefined) {
      const dailyFilter = normalizeBoolean(req.query.daily);
      if (dailyFilter !== undefined) {
        filter.daily = dailyFilter;
      }
    }

    const [poojas, total] = await Promise.all([
      Pooja.find(filter)
        .sort({ daily: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(poojaPopulate),
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

    const pooja = await Pooja.findOne(filter).populate(poojaPopulate);

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
      ideal_time: idealTimeRaw,
      description,
      blessings,
      accessType,
      price,
      currency,
      status,
      festivalIds: festivalIdsRaw,
      rating,
    } = req.body;

    const previousDeityIds = normalizeObjectIdArray(pooja.deity);
    const purpose = parseJsonField(req.body.purpose, "purpose");
    const rawSchedulesInput = resolveSchedulesInput(req.body);
    const parsedSchedules =
      rawSchedulesInput !== undefined
        ? parseSchedules(rawSchedulesInput, "schedules")
        : undefined;
    const parsedDeityIds = parseObjectIdArrayField(deity, "deity");
    if (parsedDeityIds !== undefined && !parsedDeityIds.length) {
      throw new HttpError("deity must contain at least one valid ObjectId", 400);
    }
    const deitySummary = parseJsonField(req.body.deitySummary, "deitySummary");
    const preparation = parseJsonField(req.body.preparation, "preparation");
    const parsedSteps = parseJsonField(req.body.steps, "steps");
    const mantra = parseJsonField(req.body.mantra, "mantra");
    const spiritualMeaning = parseJsonField(req.body.spiritualMeaning, "spiritualMeaning");
    const guidance = parseJsonField(req.body.guidance, "guidance");
    const completion = parseJsonField(req.body.completion, "completion");
    const mediaFromBody = parseJsonField(req.body.media, "media");
    const parsedIdealTime = parseStringArrayField(idealTimeRaw, "ideal_time");
    const festivalIds = parseObjectIdArrayField(festivalIdsRaw, "festivalIds");
    const uploadedMedia = await getUploadedMediaUrls(req.files);
    const hasUploadedStepImages = (req.files?.stepImage || []).length > 0;
    const hasUploadedMedia =
      uploadedMedia.images.length > 0 ||
      uploadedMedia.audio.length > 0 ||
      uploadedMedia.videos.length > 0 ||
      hasUploadedStepImages;
    const hasBodyUpdates =
      title !== undefined ||
      parsedSchedules !== undefined ||
      parsedDeityIds !== undefined ||
      category !== undefined ||
      req.body.daily !== undefined ||
      difficulty !== undefined ||
      duration !== undefined ||
      parsedIdealTime !== undefined ||
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
      hasUploadedStepImages ||
      req.body.stepImageMeta !== undefined ||
      festivalIds !== undefined ||
      accessType !== undefined ||
      price !== undefined ||
      currency !== undefined;
    const hasMediaUpdate = hasUploadedMedia;

    if (!hasBodyUpdates && !hasMediaUpdate) {
      throw new HttpError("Provide at least one field to update", 400);
    }

    if (title !== undefined) {
      pooja.title = title;
    }

    if (parsedDeityIds !== undefined) {
      pooja.deity = parsedDeityIds;
    }

    if (parsedSchedules !== undefined) {
      pooja.schedules = parsedSchedules;
    }

    if (category !== undefined) {
      pooja.category = category;
    }

    if (req.body.daily !== undefined || category !== undefined) {
      pooja.daily = resolveDailyFlag({
        daily: req.body.daily,
        category: category !== undefined ? category : pooja.category,
        fallback: pooja.daily,
      });
    }

    if (difficulty !== undefined) {
      pooja.difficulty = difficulty;
    }

    if (duration !== undefined) {
      pooja.duration = duration;
    }

    if (parsedIdealTime !== undefined) {
      pooja.ideal_time = parsedIdealTime;
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

    if (parsedSteps !== undefined || hasUploadedStepImages || req.body.stepImageMeta !== undefined) {
      const baseSteps =
        parsedSteps !== undefined ? parsedSteps : normalizeSteps(pooja.steps || []);
      const nextSteps = await mergeStepImageUploads(
        baseSteps,
        req.files?.stepImage || [],
        req.body.stepImageMeta
      );
      const orphanedStepImages = removedStepImageUrls(pooja.steps || [], nextSteps);
      if (orphanedStepImages.length) {
        await Promise.all(orphanedStepImages.map((url) => deleteFile(url).catch(() => {})));
      }
      pooja.steps = nextSteps;
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

    // Pricing — merge incoming partial update with the existing pooja's values,
    // then run the cross-field PAID rule against the merged result. This blocks
    // partial updates like flipping accessType→PAID without a price.
    if (accessType !== undefined || price !== undefined || currency !== undefined) {
      const pricing = resolvePricing({
        accessType: accessType !== undefined ? accessType : pooja.accessType,
        price: price !== undefined ? price : pooja.price,
        currency: currency !== undefined ? currency : pooja.currency,
      });
      pooja.accessType = pricing.accessType;
      pooja.price = pricing.price;
      pooja.currency = pricing.currency;
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

    if (parsedDeityIds !== undefined) {
      await syncDeityPujas(pooja._id, previousDeityIds, parsedDeityIds);
    }

    await pooja.populate(poojaPopulate);

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
    await pooja.populate(poojaPopulate);

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
      ...collectStepImageUrls(pooja.steps || []).map((url) => deleteFile(url).catch(() => {})),
    ]);

    // Remove from Deity.pujas
    await syncDeityPujas(pooja._id, normalizeObjectIdArray(pooja.deity), []);

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
