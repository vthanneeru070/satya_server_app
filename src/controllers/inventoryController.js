const { sendSuccess } = require("../utils/response");
const { uploadFile } = require("../services/s3Service");
const inventoryService = require("../services/inventoryService");
const { inventory: inventoryMaster } = require("../masterdata");

const getUploadedImage = (req) => {
  if (req.file) return req.file;
  if (req.files?.image?.length) return req.files.image[0];
  return null;
};

const createInventoryItem = async (req, res, next) => {
  try {
    const file = getUploadedImage(req);
    const imageUrl = file ? await uploadFile(file, "inventory") : null;
    const item = await inventoryService.createInventoryItem({
      body: req.body,
      imageUrl,
      userId: req.user.userId,
    });
    return sendSuccess(res, { item }, "Inventory item created", 201);
  } catch (error) {
    return next(error);
  }
};

const updateInventoryItem = async (req, res, next) => {
  try {
    const file = getUploadedImage(req);
    const imageUrl = file ? await uploadFile(file, "inventory") : null;
    const item = await inventoryService.updateInventoryItem({
      id: req.params.id,
      body: req.body,
      imageUrl,
    });
    return sendSuccess(res, { item }, "Inventory item updated");
  } catch (error) {
    return next(error);
  }
};

const deleteInventoryItem = async (req, res, next) => {
  try {
    const hard = String(req.query.hard || "").toLowerCase() === "true";
    const result = await inventoryService.deleteInventoryItem(req.params.id, { hard });
    return sendSuccess(
      res,
      result,
      hard ? "Inventory item permanently deleted" : "Inventory item deleted"
    );
  } catch (error) {
    return next(error);
  }
};

const getInventoryItem = async (req, res, next) => {
  try {
    const item = await inventoryService.getInventoryItemById(req.params.id);
    return sendSuccess(res, { item }, "Inventory item fetched");
  } catch (error) {
    return next(error);
  }
};

const listInventoryItems = async (req, res, next) => {
  try {
    const data = await inventoryService.listInventoryItems(req.query);
    return sendSuccess(res, data, "Inventory items fetched");
  } catch (error) {
    return next(error);
  }
};

const adjustStock = async (req, res, next) => {
  try {
    const data = await inventoryService.adjustStock(req.params.id, req.body);
    return sendSuccess(res, data, "Stock adjusted");
  } catch (error) {
    return next(error);
  }
};

const listInventoryCategories = async (req, res, next) => {
  try {
    const categories = await inventoryMaster.categories.list({
      activeOnly: req.query.activeOnly !== "false",
    });
    return sendSuccess(res, { categories }, "Inventory categories fetched");
  } catch (error) {
    return next(error);
  }
};

const seedInventoryCategories = async (req, res, next) => {
  try {
    const result = await inventoryMaster.categories.seed();
    const categories = await inventoryMaster.categories.list({ activeOnly: false });
    return sendSuccess(res, { result, categories }, "Inventory categories seeded");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  listInventoryItems,
  adjustStock,
  listInventoryCategories,
  seedInventoryCategories,
};
