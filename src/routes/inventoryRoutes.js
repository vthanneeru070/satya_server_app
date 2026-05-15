const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  listInventoryItems,
  adjustStock,
  listInventoryCategories,
  seedInventoryCategories,
} = require("../controllers/inventoryController");
const {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  inventoryIdParamsSchema,
  listInventoryQuerySchema,
  adjustStockSchema,
} = require("../validations/inventoryValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Warehouse inventory items (stock source for pooja kits)
 */

router.use(authenticate, authorizeRoles("admin"));

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: List inventory items
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 */
router.get("/", validate(listInventoryQuerySchema, "query"), listInventoryItems);

/**
 * @swagger
 * /inventory/categories:
 *   get:
 *     summary: List inventory category master data
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 */
router.get("/categories", listInventoryCategories);

/**
 * @swagger
 * /inventory/categories/seed:
 *   post:
 *     summary: Seed or refresh category master data (superadmin)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/categories/seed",
  authorizeSuperAdmin,
  seedInventoryCategories
);

/**
 * @swagger
 * /inventory:
 *   post:
 *     summary: Create inventory item
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/",
  upload.fields([{ name: "image", maxCount: 1 }]),
  validate(createInventoryItemSchema),
  createInventoryItem
);

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Get inventory item
 *     tags: [Inventory]
 */
router.get("/:id", validate(inventoryIdParamsSchema, "params"), getInventoryItem);

/**
 * @swagger
 * /inventory/{id}:
 *   patch:
 *     summary: Update inventory item
 *     tags: [Inventory]
 */
router.patch(
  "/:id",
  validate(inventoryIdParamsSchema, "params"),
  upload.fields([{ name: "image", maxCount: 1 }]),
  validate(updateInventoryItemSchema),
  updateInventoryItem
);

/**
 * @swagger
 * /inventory/{id}/adjust-stock:
 *   post:
 *     summary: Adjust stock by delta (+/-)
 *     tags: [Inventory]
 */
router.post(
  "/:id/adjust-stock",
  validate(inventoryIdParamsSchema, "params"),
  validate(adjustStockSchema),
  adjustStock
);

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Soft-delete inventory item
 *     tags: [Inventory]
 */
router.delete("/:id", validate(inventoryIdParamsSchema, "params"), deleteInventoryItem);

module.exports = router;
