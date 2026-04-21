const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const uploadDonationImage = require("../middleware/uploadDonationImage");
const {
  createDonation,
  updateDonation,
  deleteDonation,
  getMyDonations,
  getAllDonations,
  reviewDonation,
  getVisibleDonations,
} = require("../controllers/donationController");
const {
  createDonationSchema,
  updateDonationSchema,
  reviewDonationSchema,
  donationIdParamsSchema,
} = require("../validations/donationValidation");

const router = express.Router();

router.get("/", authenticate, getVisibleDonations);
router.post(
  "/create-donation",
  authenticate,
  authorizeRoles("admin"),
  uploadDonationImage.single("image"),
  validate(createDonationSchema),
  createDonation
);
router.get("/my", authenticate, authorizeRoles("admin"), getMyDonations);
router.get("/all", authenticate, authorizeSuperAdmin, getAllDonations);
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  uploadDonationImage.single("image"),
  validate(donationIdParamsSchema, "params"),
  validate(updateDonationSchema),
  updateDonation
);
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(donationIdParamsSchema, "params"),
  deleteDonation
);
router.put(
  "/review/:id",
  authenticate,
  authorizeSuperAdmin,
  validate(donationIdParamsSchema, "params"),
  validate(reviewDonationSchema),
  reviewDonation
);

module.exports = router;
