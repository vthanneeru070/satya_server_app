const Pooja = require("../models/Pooja");
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

const createPooja = async (req, res, next) => {
  try {
    const { title, description } = req.body;

    if (!req.file) {
      throw new HttpError("Pooja image is required", 400);
    }

    const imageUrl = `/uploads/poojas/${req.file.filename}`;

    const pooja = await Pooja.create({
      title,
      description,
      imageUrl,
      createdBy: req.user.userId,
    });

    return sendSuccess(res, { pooja }, "Pooja created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getPoojas = async (_req, res, next) => {
  try {
    const poojas = await Pooja.find()
      .sort({ createdAt: -1 })
      .populate("createdBy", "email role");

    return sendSuccess(res, { poojas }, "Poojas fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getPoojaById = async (req, res, next) => {
  try {
    const pooja = await Pooja.findById(req.params.id).populate("createdBy", "email role");

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

    const { title, description } = req.body;
    const hasBodyUpdates = title !== undefined || description !== undefined;
    const hasImageUpdate = Boolean(req.file);

    if (!hasBodyUpdates && !hasImageUpdate) {
      throw new HttpError("Provide at least one field to update", 400);
    }

    if (title !== undefined) {
      pooja.title = title;
    }

    if (description !== undefined) {
      pooja.description = description;
    }

    if (req.file) {
      const nextImageUrl = `/uploads/poojas/${req.file.filename}`;
      const previousImageUrl = pooja.imageUrl;
      pooja.imageUrl = nextImageUrl;
      await deleteLocalImage(previousImageUrl);
    }

    await pooja.save();
    await pooja.populate("createdBy", "email role");

    return sendSuccess(res, { pooja }, "Pooja updated successfully");
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

    await deleteLocalImage(pooja.imageUrl);
    await pooja.deleteOne();

    return sendSuccess(res, null, "Pooja deleted successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPooja,
  getPoojas,
  getPoojaById,
  updatePooja,
  deletePooja,
};
