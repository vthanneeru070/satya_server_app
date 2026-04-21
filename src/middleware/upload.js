const multer = require("multer");

const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "video/"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (!file?.mimetype) {
    return cb(new Error("Invalid file type"));
  }

  const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix));
  if (!isAllowed) {
    return cb(new Error("Only image, audio, or video files are allowed"));
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

module.exports = upload;
