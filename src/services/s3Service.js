const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const HttpError = require("../utils/httpError");

const readEnv = () => ({
  accessKey: process.env.AWS_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
  secretKey: process.env.AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  region: (process.env.AWS_REGION || "us-east-1").trim(),
  bucket: String(process.env.AWS_BUCKET_NAME || "").trim(),
});

const validateConfig = () => {
  const { accessKey, secretKey, region, bucket } = readEnv();
  if (!accessKey || !secretKey || !region || !bucket) {
    throw new HttpError("AWS S3 configuration is missing", 500);
  }
};

const getS3Client = () => {
  const { accessKey, secretKey, region } = readEnv();
  return new S3Client({
    region,
    credentials: {
      accessKeyId: accessKey || "",
      secretAccessKey: secretKey || "",
    },
  });
};

const sanitizeFolder = (folder = "general") => folder.replace(/^\/+|\/+$/g, "") || "general";

/**
 * Path-style URLs work for every bucket and are required when the bucket name
 * contains dots (e.g. admin-test.satya.co.za). Virtual-hosted style breaks SSL
 * for dotted bucket names.
 *
 * Opt out only with AWS_S3_PATH_STYLE=false
 */
const usesPathStylePublicUrl = () => {
  if (process.env.AWS_S3_PATH_STYLE === "false") return false;
  if (process.env.AWS_S3_PATH_STYLE === "true") return true;
  return true;
};

const buildPublicUrl = (key) => {
  const { region, bucket } = readEnv();
  const customBase = process.env.AWS_S3_PUBLIC_URL_BASE;

  if (customBase) {
    return `${String(customBase).replace(/\/+$/, "")}/${key}`;
  }

  if (usesPathStylePublicUrl()) {
    return `https://s3.${region}.amazonaws.com/${bucket}/${key}`;
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const extractKeyFromUrl = (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== "string") {
    return null;
  }

  const { region, bucket } = readEnv();
  const prefixes = [];

  const customBase = process.env.AWS_S3_PUBLIC_URL_BASE;
  if (customBase) {
    prefixes.push(`${String(customBase).replace(/\/+$/, "")}/`);
  }

  prefixes.push(`https://s3.${region}.amazonaws.com/${bucket}/`);
  prefixes.push(`https://${bucket}.s3.${region}.amazonaws.com/`);

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

  const { bucket } = readEnv();
  const extension = path.extname(file.originalname || "").toLowerCase();
  const safeExtension = extension || "";
  const key = `${sanitizeFolder(folder)}/${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || "application/octet-stream",
  });

  await getS3Client().send(command);
  return buildPublicUrl(key);
};

const deleteFile = async (fileUrl) => {
  validateConfig();
  const key = extractKeyFromUrl(fileUrl);
  if (!key) {
    return;
  }

  const { bucket } = readEnv();
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await getS3Client().send(command);
};

module.exports = {
  uploadFile,
  deleteFile,
  _internal: { buildPublicUrl, readEnv },
};
