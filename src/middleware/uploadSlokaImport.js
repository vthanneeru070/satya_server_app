const multer = require("multer");

const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (!file?.mimetype) {
    return cb(new Error("Invalid file type"));
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error("Only .xlsx and .docx files are allowed"));
  }

  return cb(null, true);
};

const uploadSlokaImport = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

module.exports = uploadSlokaImport;
