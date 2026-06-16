const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const HttpError = require("../utils/httpError");

const {
  AWS_ACCESS_KEY,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_KEY,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION = "us-east-1",
  AWS_BUCKET_NAME,
} = process.env;

const resolvedAccessKey = AWS_ACCESS_KEY || AWS_ACCESS_KEY_ID;
const resolvedSecretKey = AWS_SECRET_KEY || AWS_SECRET_ACCESS_KEY;

const validateConfig = () => {
  if (!resolvedAccessKey || !resolvedSecretKey || !AWS_REGION || !AWS_BUCKET_NAME) {
    throw new HttpError("AWS S3 configuration is missing", 500);
  }
};

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: resolvedAccessKey || "",
    secretAccessKey: resolvedSecretKey || "",
  },
});

const sanitizeFolder = (folder = "general") => folder.replace(/^\/+|\/+$/g, "") || "general";

/** Buckets with dots must use path-style URLs (virtual-hosted breaks SSL). */
const usesPathStylePublicUrl = () =>
  process.env.AWS_S3_PATH_STYLE === "true" ||
  String(AWS_BUCKET_NAME || "").includes(".");

const buildPublicUrl = (key) => {
  const customBase = process.env.AWS_S3_PUBLIC_URL_BASE;
  if (customBase) {
    return `${String(customBase).replace(/\/+$/, "")}/${key}`;
  }

  if (usesPathStylePublicUrl()) {
    return `https://s3.${AWS_REGION}.amazonaws.com/${AWS_BUCKET_NAME}/${key}`;
  }

  return `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

const extractKeyFromUrl = (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== "string") {
    return null;
  }

  const prefixes = [];

  const customBase = process.env.AWS_S3_PUBLIC_URL_BASE;
  if (customBase) {
    prefixes.push(`${String(customBase).replace(/\/+$/, "")}/`);
  }

  prefixes.push(`https://s3.${AWS_REGION}.amazonaws.com/${AWS_BUCKET_NAME}/`);
  prefixes.push(`https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/`);

  const matched = prefixes.find((prefix) => fileUrl.startsWith(prefix));
  if (!matched) {
    return null;
  }

  return fileUrl.slice(matched.length);
};

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
  });

  await s3Client.send(command);
  return buildPublicUrl(key);
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
