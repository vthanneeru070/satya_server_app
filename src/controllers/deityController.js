const Deity = require("../models/Deity");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");

const createDeity = async (req, res, next) => {
  try {
    const status = req.user.isSuperAdmin === true ? req.body.status || "APPROVED" : "PENDING";
    const deity = await Deity.create({
      ...req.body,
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
    .populate("rituals", "title");

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

    const [deities, total] = await Promise.all([
      Deity.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "email role")
        .populate("rituals", "title"),
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
      .populate("rituals", "title");

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
    const hasAnyField = Object.keys(req.body).length > 0;
    if (!hasAnyField) {
      throw new HttpError("Provide at least one field to update", 400);
    }

    const deity = await Deity.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("createdBy", "email role")
      .populate("rituals", "title");

    if (!deity) {
      throw new HttpError("Deity not found", 404);
    }

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
      .populate("rituals", "title");

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
