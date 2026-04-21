const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const uploadFestivalImage = require("../middleware/uploadFestivalImage");
const {
  createFestival,
  getMyFestivals,
  getAllFestivals,
  getVisibleFestivals,
  updateFestival,
  deleteFestival,
  reviewFestival,
} = require("../controllers/festivalController");
const {
  createFestivalSchema,
  updateFestivalSchema,
  reviewFestivalSchema,
  festivalIdParamsSchema,
} = require("../validations/festivalValidation");

const router = express.Router();

router.get("/", authenticate, getVisibleFestivals);
router.post(
  "/create-festival",
  authenticate,
  authorizeRoles("admin"),
  uploadFestivalImage.single("image"),
  validate(createFestivalSchema),
  createFestival
);
router.get("/my", authenticate, authorizeRoles("admin"), getMyFestivals);
router.get("/all", authenticate, authorizeSuperAdmin, getAllFestivals);
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  uploadFestivalImage.single("image"),
  validate(festivalIdParamsSchema, "params"),
  validate(updateFestivalSchema),
  updateFestival
);
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(festivalIdParamsSchema, "params"),
  deleteFestival
);
router.put(
  "/review/:id",
  authenticate,
  authorizeSuperAdmin,
  validate(festivalIdParamsSchema, "params"),
  validate(reviewFestivalSchema),
  reviewFestival
);

module.exports = router;
