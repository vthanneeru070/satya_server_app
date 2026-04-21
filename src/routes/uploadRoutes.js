const express = require("express");
const authenticate = require("../middleware/authenticate");
const upload = require("../middleware/upload");
const { uploadFile } = require("../services/s3Service");
const { sendSuccess } = require("../utils/response");

const router = express.Router();
const ALLOWED_FOLDERS = new Set(["donations", "rituals", "festivals", "general"]);

router.post("/upload", authenticate, upload.any(), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: "At least one file is required" });
    }

    const folder = String(req.body.folder || "general").trim().toLowerCase();
    if (!ALLOWED_FOLDERS.has(folder)) {
      return res.status(400).json({ success: false, message: "Invalid folder name" });
    }

    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const url = await uploadFile(file, folder);
        return {
          fieldname: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url,
        };
      })
    );

    return sendSuccess(
      res,
      {
        files: uploadedFiles,
      },
      "Files uploaded successfully",
      201
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
