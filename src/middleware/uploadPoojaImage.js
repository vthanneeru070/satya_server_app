const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.resolve(process.cwd(), "uploads", "poojas");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const safeExtension = extension || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!file.mimetype) {
    return cb(new Error("Invalid file type"));
  }

  if (file.fieldname === "image" && file.mimetype.startsWith("image/")) {
    return cb(null, true);
  }

  if (file.fieldname === "audio" && file.mimetype.startsWith("audio/")) {
    return cb(null, true);
  }

  if (file.fieldname === "video" && file.mimetype.startsWith("video/")) {
    return cb(null, true);
  }

  return cb(new Error(`Invalid file type for field ${file.fieldname}`));
};

const uploadPoojaMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

module.exports = uploadPoojaMedia;
