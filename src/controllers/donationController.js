const Donation = require("../models/Donation");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { uploadFile, deleteFile } = require("../services/s3Service");

const createDonation = async (req, res, next) => {
  try {
    const { title, description } = req.body;

    if (!req.file) {
      throw new HttpError("Donation image is required", 400);
    }

    const image = await uploadFile(req.file, "donations");

    const donation = await Donation.create({
      title,
      description,
      image,
      createdBy: req.user.userId,
      status: "PENDING",
      isVisible: false,
    });

    return sendSuccess(res, { donation }, "Donation created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getMyDonations = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = { createdBy: req.user.userId };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [donations, total] = await Promise.all([
      Donation.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "email role isSuperAdmin"),
      Donation.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        donations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "My donations fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const getAllDonations = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [donations, total] = await Promise.all([
      Donation.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "email role isSuperAdmin"),
      Donation.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        donations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "All donations fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const reviewDonation = async (req, res, next) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) {
      throw new HttpError("Donation not found", 404);
    }

    const { status } = req.body;
    donation.status = status;
    donation.isVisible = status === "APPROVED";

    await donation.save();
    await donation.populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(res, { donation }, "Donation reviewed successfully");
  } catch (error) {
    return next(error);
  }
};

const updateDonation = async (req, res, next) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) {
      throw new HttpError("Donation not found", 404);
    }

    const isOwner = donation.createdBy.toString() === req.user.userId;
    if (!isOwner && req.user.isSuperAdmin !== true) {
      throw new HttpError("You are not authorized to modify this donation", 403);
    }

    const { title, description } = req.body;
    const hasBodyUpdates = title !== undefined || description !== undefined;
    const hasImageUpdate = Boolean(req.file);

    if (!hasBodyUpdates && !hasImageUpdate) {
      throw new HttpError("Provide at least one field to update", 400);
    }

    if (title !== undefined) {
      donation.title = title;
    }

    if (description !== undefined) {
      donation.description = description;
    }

    if (req.file) {
      const nextImage = await uploadFile(req.file, "donations");
      const previousImage = donation.image;
      donation.image = nextImage;
      await deleteFile(previousImage).catch(() => {});
    }

    donation.status = "PENDING";
    donation.isVisible = false;

    await donation.save();
    await donation.populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(
      res,
      { donation },
      "Donation updated successfully and sent for approval"
    );
  } catch (error) {
    return next(error);
  }
};

const deleteDonation = async (req, res, next) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) {
      throw new HttpError("Donation not found", 404);
    }

    const isOwner = donation.createdBy.toString() === req.user.userId;
    if (!isOwner && req.user.isSuperAdmin !== true) {
      throw new HttpError("You are not authorized to delete this donation", 403);
    }

    await deleteFile(donation.image).catch(() => {});
    await donation.deleteOne();

    return sendSuccess(res, null, "Donation deleted successfully");
  } catch (error) {
    return next(error);
  }
};

const getVisibleDonations = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.user?.role !== "admin") {
      filter.status = "APPROVED";
      filter.isVisible = true;
    } else if (req.query.status) {
      filter.status = req.query.status;
    }

    const [donations, total] = await Promise.all([
      Donation.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "email role"),
      Donation.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        donations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Approved donations fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createDonation,
  updateDonation,
  deleteDonation,
  getMyDonations,
  getAllDonations,
  reviewDonation,
  getVisibleDonations,
};
