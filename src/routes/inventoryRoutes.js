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
 *   description: Warehouse inventory (stock source for pooja kits). Admin JWT required.
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
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string, example: SACRED_POWDERS }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *       - in: query
 *         name: lowStock
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Paginated inventory list
 */
router.get("/", validate(listInventoryQuerySchema, "query"), listInventoryItems);

/**
 * @swagger
 * /inventory/categories:
 *   get:
 *     summary: List inventory category master data
 *     description: Use codes in `category` when creating inventory items. Seed via POST /inventory/categories/seed (superadmin).
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema: { type: boolean, default: true }
 *     responses:
 *       200:
 *         description: Categories list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items: { $ref: "#/components/schemas/InventoryCategory" }
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
 *     responses:
 *       200:
 *         description: Categories seeded
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
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: "#/components/schemas/InventoryCreateMultipart"
 *     responses:
 *       201:
 *         description: Inventory item created
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
 *     summary: Get inventory item by id
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Inventory item
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     item: { $ref: "#/components/schemas/InventoryItem" }
 *       404:
 *         description: Not found
 */
router.get("/:id", validate(inventoryIdParamsSchema, "params"), getInventoryItem);

/**
 * @swagger
 * /inventory/{id}:
 *   patch:
 *     summary: Update inventory item
 *     description: Partial update. Set `status` to ACTIVE or INACTIVE. Optional `image` file.
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: "#/components/schemas/InventoryUpdateMultipart"
 *     responses:
 *       200:
 *         description: Updated
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [delta]
 *             properties:
 *               delta: { type: number, example: 10, description: "Positive to add, negative to remove" }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Stock adjusted
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
 *     description: Sets isDeleted and status INACTIVE. Use `?hard=true` for permanent delete.
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: hard
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete("/:id", validate(inventoryIdParamsSchema, "params"), deleteInventoryItem);

module.exports = router;
