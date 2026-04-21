const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const HttpError = require("../utils/httpError");

const {
  AWS_ACCESS_KEY,
  AWS_SECRET_KEY,
  AWS_REGION = "us-east-1",
  AWS_BUCKET_NAME,
} = process.env;

const validateConfig = () => {
  if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY || !AWS_REGION || !AWS_BUCKET_NAME) {
    throw new HttpError("AWS S3 configuration is missing", 500);
  }
};

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY || "",
    secretAccessKey: AWS_SECRET_KEY || "",
  },
});

const buildPublicUrl = (key) => `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;

const sanitizeFolder = (folder = "general") => folder.replace(/^\/+|\/+$/g, "") || "general";

const uploadFile = async (file, folder = "general") => {
  validateConfig();

  if (!file || !file.buffer) {
    throw new HttpError("File buffer is missing", 400);
  }

  const extension = path.extname(file.originalname || "").toLowerCase();
  const safeExtension = extension || "";
  const key = `${sanitizeFolder(folder)}/${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`;

  const command = new PutObjectCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || "application/octet-stream",
    ACL: "public-read",
  });

  await s3Client.send(command);
  return buildPublicUrl(key);
};

const extractKeyFromUrl = (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== "string") {
    return null;
  }

  const bucketUrlPrefix = `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/`;
  if (!fileUrl.startsWith(bucketUrlPrefix)) {
    return null;
  }

  return fileUrl.slice(bucketUrlPrefix.length);
};

const deleteFile = async (fileUrl) => {
  validateConfig();
  const key = extractKeyFromUrl(fileUrl);
  if (!key) {
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
};

module.exports = {
  uploadFile,
  deleteFile,
};
