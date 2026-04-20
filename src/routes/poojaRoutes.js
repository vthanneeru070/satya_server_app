const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const validate = require("../middleware/validate");
const uploadPoojaImage = require("../middleware/uploadPoojaImage");
const {
  createPooja,
  getPoojas,
  getPoojaById,
  updatePooja,
  deletePooja,
} = require("../controllers/poojaController");
const {
  createPoojaSchema,
  updatePoojaSchema,
  poojaIdParamsSchema,
} = require("../validations/poojaValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Poojas
 *   description: Pooja management APIs
 */

/**
 * @swagger
 * /poojas/create-pooja:
 *   post:
 *     summary: Create pooja
 *     description: Requires admin role. Upload pooja with image, title, and description.
 *     tags: [Poojas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, description, image]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Pooja created successfully
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 */
router.post(
  "/create-pooja",
  authenticate,
  authorizeRoles("admin"),
  uploadPoojaImage.single("image"),
  validate(createPoojaSchema),
  createPooja
);

/**
 * @swagger
 * /poojas:
 *   get:
 *     summary: Get all poojas
 *     tags: [Poojas]
 *     responses:
 *       200:
 *         description: Poojas fetched successfully
 */
router.get("/", getPoojas);

/**
 * @swagger
 * /poojas/{id}:
 *   get:
 *     summary: Get pooja by id
 *     tags: [Poojas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pooja fetched successfully
 *       404:
 *         description: Pooja not found
 */
router.get("/:id", validate(poojaIdParamsSchema, "params"), getPoojaById);

/**
 * @swagger
 * /poojas/{id}:
 *   patch:
 *     summary: Update pooja
 *     description: Requires admin role. Update pooja title/description and optionally replace image.
 *     tags: [Poojas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Pooja updated successfully
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Pooja not found
 */
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  uploadPoojaImage.single("image"),
  validate(poojaIdParamsSchema, "params"),
  validate(updatePoojaSchema),
  updatePooja
);

/**
 * @swagger
 * /poojas/{id}:
 *   delete:
 *     summary: Delete pooja
 *     description: Requires admin role. Permanently deletes pooja and its image.
 *     tags: [Poojas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pooja deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Pooja not found
 */
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(poojaIdParamsSchema, "params"),
  deletePooja
);

module.exports = router;
