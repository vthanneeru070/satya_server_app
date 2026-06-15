const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const normalizeProductBody = require("../middleware/normalizeProductBody");
const {
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getProductById,
  listProducts,
  listAllProducts,
  listMyProducts,
  setProductStatus,
  setFeatured,
  reviewProduct,
  getFeaturedProducts,
  getPopularProducts,
} = require("../controllers/productController");
const {
  createProductSchema,
  updateProductSchema,
  productIdParamsSchema,
  listProductsQuerySchema,
  listAllProductsQuerySchema,
  reviewProductSchema,
  toggleProductStatusSchema,
  toggleFeaturedSchema,
} = require("../validations/productValidation");

const router = express.Router();

/**
 * Optional authenticate — attaches req.user when a valid token is supplied,
 * but does NOT reject anonymous requests. Used on public read routes so the
 * controller can show APPROVED+ACTIVE-only items to guests and admins can use
 * the same URL to see other statuses via query flags.
 */
const optionalAuthenticate = (req, res, next) => {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, (err) => {
    if (err) return next();
    return next();
  });
};

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Pooja Kit catalog (spiritual product) APIs
 */

/**
 * @swagger
 * /products/featured:
 *   get:
 *     summary: List featured pooja kits (public, APPROVED + ACTIVE only)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200: { description: Featured products fetched }
 */
router.get("/featured", getFeaturedProducts);

/**
 * @swagger
 * /products/popular:
 *   get:
 *     summary: List popular pooja kits (public, APPROVED + ACTIVE only)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200: { description: Popular products fetched }
 */
router.get("/popular", getPopularProducts);

/**
 * @swagger
 * /products:
 *   get:
 *     summary: List / search / filter pooja kits
 *     description: |
 *       Public callers see only `status: APPROVED` AND `productStatus: ACTIVE`
 *       products that are not soft-deleted. Authenticated admins/superadmins
 *       can pass `status`, `productStatus`, and `includeDeleted=true` to see
 *       additional rows.
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive substring match against title
 *       - in: query
 *         name: deity
 *         schema: { type: string }
 *         description: Deity ObjectId
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [ayurvedic, pujakit, book]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PENDING, APPROVED, REJECTED, QUEUED]
 *         description: Admin-only review status filter
 *       - in: query
 *         name: productStatus
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *         description: Admin-only publish toggle filter
 *       - in: query
 *         name: isFeatured
 *         schema: { type: boolean }
 *       - in: query
 *         name: inStock
 *         schema: { type: boolean }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, price, title, purchaseCount], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: includeDeleted
 *         schema: { type: boolean, default: false }
 *         description: Admin-only. When true, returns soft-deleted products too.
 *     responses:
 *       200: { description: Products fetched successfully }
 */
router.get(
  "/",
  optionalAuthenticate,
  validate(listProductsQuerySchema, "query"),
  listProducts
);

/**
 * @swagger
 * /products/all:
 *   get:
 *     summary: Get all products (any review status)
 *     description: Requires super admin role. Returns the full catalog regardless of review status; soft-deleted items hidden unless `includeDeleted=true`.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PENDING, APPROVED, REJECTED, QUEUED]
 *       - in: query
 *         name: productStatus
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *       - in: query
 *         name: includeDeleted
 *         schema: { type: boolean, default: false }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: All products fetched successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (super admin required) }
 */
router.get(
  "/all",
  authenticate,
  authorizeRoles("admin"),
  validate(listAllProductsQuerySchema, "query"),
  listAllProducts
);

/**
 * @swagger
 * /products/my:
 *   get:
 *     summary: Get my products (admin-owned, any review status)
 *     description: Requires admin role. Returns products created by the logged-in admin/superadmin.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PENDING, APPROVED, REJECTED, QUEUED]
 *       - in: query
 *         name: productStatus
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: My products fetched successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (admin role required) }
 */
router.get(
  "/my",
  authenticate,
  authorizeRoles("admin"),
  validate(listAllProductsQuerySchema, "query"),
  listMyProducts
);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get product details
 *     description: Public callers can only fetch APPROVED + ACTIVE products. Admins/superadmins can fetch any non-deleted product.
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Product fetched successfully }
 *       404: { description: Product not found }
 */
router.get(
  "/:id",
  optionalAuthenticate,
  validate(productIdParamsSchema, "params"),
  getProductById
);

/**
 * @swagger
 * /products/create-product:
 *   post:
 *     summary: Create a new pooja kit product (admin)
 *     description: |
 *       Admins can save a `DRAFT` or submit for review (`PENDING`, default).
 *       Approval is owned by superadmin via the review endpoint.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ProductCreateMultipart'
 *     responses:
 *       201: { description: Product created successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (admin role required) }
 *       409: { description: Slug already exists }
 */
router.post(
  "/create-product",
  authenticate,
  authorizeRoles("admin"),
  upload.single("image"),
  normalizeProductBody,
  validate(createProductSchema),
  createProduct
);

/**
 * @swagger
 * /products/{id}:
 *   patch:
 *     summary: Update a pooja kit product (admin)
 *     description: |
 *       Admins can update content and toggle `productStatus` (ACTIVE/INACTIVE),
 *       but `status` can only be set to `DRAFT` or `PENDING` here — promoting
 *       past PENDING is reserved for superadmin review.
 *     tags: [Products]
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
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ProductUpdateMultipart'
 *     responses:
 *       200: { description: Product updated successfully }
 *       400: { description: Validation error }
 *       404: { description: Product not found }
 */
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  upload.single("image"),
  normalizeProductBody,
  validate(productIdParamsSchema, "params"),
  validate(updateProductSchema),
  updateProduct
);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Soft-delete a pooja kit product (admin)
 *     description: Pass `?hard=true` to permanently delete and remove the image from S3. Soft delete sets `productStatus=INACTIVE` and keeps review `status` intact.
 *     tags: [Products]
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
 *       200: { description: Product deleted successfully }
 *       404: { description: Product not found }
 */
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(productIdParamsSchema, "params"),
  deleteProduct
);

/**
 * @swagger
 * /products/{id}/restore:
 *   patch:
 *     summary: Restore a soft-deleted product (admin)
 *     description: Clears `isDeleted` and sets `productStatus=ACTIVE`. Review status is left untouched.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Product restored successfully }
 *       404: { description: Product not found }
 */
router.patch(
  "/:id/restore",
  authenticate,
  authorizeRoles("admin"),
  validate(productIdParamsSchema, "params"),
  restoreProduct
);

/**
 * @swagger
 * /products/{id}/status:
 *   patch:
 *     summary: Toggle product publish status ACTIVE/INACTIVE (admin)
 *     description: Flips `productStatus` only. Does not affect the review workflow (`status`).
 *     tags: [Products]
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
 *             required: [productStatus]
 *             properties:
 *               productStatus:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *     responses:
 *       200: { description: Product publish status updated }
 */
router.patch(
  "/:id/status",
  authenticate,
  authorizeRoles("admin"),
  validate(productIdParamsSchema, "params"),
  validate(toggleProductStatusSchema),
  setProductStatus
);

/**
 * @swagger
 * /products/{id}/featured:
 *   patch:
 *     summary: Toggle product featured flag (admin)
 *     tags: [Products]
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
 *             required: [isFeatured]
 *             properties:
 *               isFeatured:
 *                 type: boolean
 *     responses:
 *       200: { description: Featured flag updated }
 */
router.patch(
  "/:id/featured",
  authenticate,
  authorizeRoles("admin"),
  validate(productIdParamsSchema, "params"),
  validate(toggleFeaturedSchema),
  setFeatured
);

/**
 * @swagger
 * /products/review/{id}:
 *   put:
 *     summary: Review product
 *     description: Requires super admin role. Move the product through the review workflow (APPROVED / REJECTED / QUEUED / DRAFT).
 *     tags: [Products]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [APPROVED, REJECTED, QUEUED, DRAFT]
 *     responses:
 *       200: { description: Product reviewed successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (super admin required) }
 *       404: { description: Product not found }
 */
router.put(
  "/review/:id",
  authenticate,
  authorizeSuperAdmin,
  validate(productIdParamsSchema, "params"),
  validate(reviewProductSchema),
  reviewProduct
);

module.exports = router;
