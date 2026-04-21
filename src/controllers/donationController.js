const Donation = require("../models/Donation");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const fs = require("fs");
const path = require("path");

const deleteLocalImage = async (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("/uploads/")) {
    return;
  }

  const relativePath = imageUrl.replace(/^\/+/, "");
  const absolutePath = path.resolve(process.cwd(), relativePath);
  await fs.promises.unlink(absolutePath).catch(() => {});
};

const createDonation = async (req, res, next) => {
  try {
    const { title, description } = req.body;

    if (!req.file) {
      throw new HttpError("Donation image is required", 400);
    }

    const image = `/uploads/donations/${req.file.filename}`;

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
    const donations = await Donation.find({ createdBy: req.user.userId })
      .sort({ createdAt: -1 })
      .populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(res, { donations }, "My donations fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getAllDonations = async (_req, res, next) => {
  try {
    const donations = await Donation.find()
      .sort({ createdAt: -1 })
      .populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(res, { donations }, "All donations fetched successfully");
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
      const nextImage = `/uploads/donations/${req.file.filename}`;
      const previousImage = donation.image;
      donation.image = nextImage;
      await deleteLocalImage(previousImage);
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

    await deleteLocalImage(donation.image);
    await donation.deleteOne();

    return sendSuccess(res, null, "Donation deleted successfully");
  } catch (error) {
    return next(error);
  }
};

const getVisibleDonations = async (_req, res, next) => {
  try {
    const donations = await Donation.find({ isVisible: true, status: "APPROVED" })
      .sort({ createdAt: -1 })
      .populate("createdBy", "email role");

    return sendSuccess(res, { donations }, "Approved donations fetched successfully");
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
