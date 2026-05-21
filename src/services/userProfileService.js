const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const HttpError = require("../utils/httpError");
const { uploadFile, deleteFile } = require("./s3Service");
const {
  toTrimmedOrNull,
  normalizeGender,
  normalizeCountryCode,
  normalizePhone,
  normalizeTimeOfBirth,
  parseDateOfBirth,
  normalizePlaceOfBirth,
  normalizeZodiacSign,
  attachIsRegistered,
} = require("../utils/userProfile");

const getUploadedImage = (req) => {
  if (req.file) return req.file;
  if (req.files?.image?.length) return req.files.image[0];
  return null;
};

const assertEndUser = (user) => {
  if (!user || user.isDeleted) throw new HttpError("User not found", 404);
  if (user.role === "admin" || user.role === "superadmin") {
    throw new HttpError("This endpoint is for mobile app users only", 403);
  }
};

const loadUser = async (userId) => {
  const user = await User.findById(userId);
  assertEndUser(user);
  return user;
};

const markProfileRegistered = (user) => {
  user.isRegistered = true;
  return true;
};

const formatProfileResponse = (user) => {
  const payload = attachIsRegistered(user);
  return { user: payload, isRegistered: payload.isRegistered };
};

const applyProfileFields = (user, body, { requireAll = false } = {}) => {
  const errors = [];

  if (body.fullName !== undefined || requireAll) {
    const fullName = toTrimmedOrNull(body.fullName);
    if (!fullName) errors.push("fullName is required");
    else user.fullName = fullName;
  }

  if (body.gender !== undefined || requireAll) {
    const gender = normalizeGender(body.gender);
    if (!gender) errors.push("Invalid gender");
    else user.gender = gender;
  }

  if (body.dateOfBirth !== undefined || requireAll) {
    const dateOfBirth = parseDateOfBirth(body.dateOfBirth);
    if (!dateOfBirth) errors.push("Invalid dateOfBirth");
    else user.dateOfBirth = dateOfBirth;
  }

  if (body.timeOfBirth !== undefined) {
    const timeOfBirth = normalizeTimeOfBirth(body.timeOfBirth);
    if (body.timeOfBirth !== null && body.timeOfBirth !== "" && !timeOfBirth) {
      errors.push("Invalid timeOfBirth (use HH:mm)");
    } else user.timeOfBirth = timeOfBirth;
  }

  if (body.placeOfBirth !== undefined) {
    const placeOfBirth = normalizePlaceOfBirth(body.placeOfBirth);
    if (body.placeOfBirth !== null && body.placeOfBirth !== "" && !placeOfBirth) {
      errors.push("Invalid placeOfBirth");
    } else user.placeOfBirth = placeOfBirth;
  }

  if (body.sunSign !== undefined) {
    const sunSign = normalizeZodiacSign(body.sunSign);
    if (body.sunSign !== null && body.sunSign !== "" && !sunSign) {
      errors.push("Invalid sunSign");
    } else user.sunSign = sunSign;
  }

  if (body.moonSign !== undefined) {
    const moonSign = normalizeZodiacSign(body.moonSign);
    if (body.moonSign !== null && body.moonSign !== "" && !moonSign) {
      errors.push("Invalid moonSign");
    } else user.moonSign = moonSign;
  }

  if (body.countryCode !== undefined || requireAll) {
    const countryCode = normalizeCountryCode(body.countryCode);
    if (!countryCode) errors.push("Invalid countryCode");
    else user.countryCode = countryCode;
  }

  if (body.phone !== undefined || requireAll) {
    const phone = normalizePhone(body.phone);
    if (!phone) errors.push("Invalid phone number");
    else user.phone = phone;
  }

  if (body.firstName !== undefined) user.firstName = toTrimmedOrNull(body.firstName);
  if (body.lastName !== undefined) user.lastName = toTrimmedOrNull(body.lastName);
  if (body.timezone !== undefined) {
    user.timezone = toTrimmedOrNull(body.timezone) || user.timezone;
  }
  if (body.preferredLanguage !== undefined) {
    user.preferredLanguage = body.preferredLanguage;
  }

  if (errors.length) {
    throw new HttpError(errors.join("; "), 400);
  }
};

const applyProfileImage = async (user, req, { required = false } = {}) => {
  const file = getUploadedImage(req);
  if (!file) {
    if (required && !toTrimmedOrNull(user.profileImageUrl) && !toTrimmedOrNull(user.photoUrl)) {
      throw new HttpError("Profile image is required", 400);
    }
    return;
  }

  if (user.profileImageUrl) {
    await deleteFile(user.profileImageUrl).catch(() => {});
  }

  user.profileImageUrl = await uploadFile(file, "profiles");
};

const createProfile = async (userId, body, req) => {
  const user = await loadUser(userId);

  if (user.isRegistered) {
    throw new HttpError("Profile already registered. Use PATCH /auth/profile to edit.", 409);
  }

  applyProfileFields(user, body, { requireAll: true });
  await applyProfileImage(user, req, { required: true });

  user.lastActiveAt = new Date();
  markProfileRegistered(user);
  await user.save();

  return formatProfileResponse(user);
};

const editProfile = async (userId, body, req) => {
  const user = await loadUser(userId);

  if (!Object.keys(body || {}).length && !getUploadedImage(req)) {
    throw new HttpError("At least one field is required to update profile", 400);
  }

  applyProfileFields(user, body, { requireAll: false });
  await applyProfileImage(user, req, { required: false });

  user.lastActiveAt = new Date();
  await user.save();

  return formatProfileResponse(user);
};

const getProfile = async (userId) => {
  const user = await User.findById(userId).select("-__v").lean();
  assertEndUser(user);
  const payload = attachIsRegistered(user);
  payload.favoriteDeityIds = (user.favoriteDeities || []).map(String);
  return { user: payload, isRegistered: payload.isRegistered };
};

const deleteAccount = async (userId, { refreshToken, comment } = {}) => {
  const user = await loadUser(userId);

  const deletionComment = toTrimmedOrNull(comment);
  if (!deletionComment || deletionComment.length < 5) {
    throw new HttpError(
      "A comment is required to delete your account (5–500 characters).",
      400
    );
  }

  if (user.profileImageUrl) {
    await deleteFile(user.profileImageUrl).catch(() => {});
  }

  user.isDeleted = true;
  user.isRegistered = false;
  user.accountDeletionComment = deletionComment;
  user.accountDeletedAt = new Date();
  user.fcmTokens = [];
  user.profileImageUrl = null;
  user.lastActiveAt = new Date();
  await user.save();

  if (refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken, userId: user._id });
  }
  await RefreshToken.deleteMany({ userId: user._id });

  return { id: user._id.toString(), deleted: true };
};

module.exports = {
  createProfile,
  editProfile,
  getProfile,
  deleteAccount,
  markProfileRegistered,
  formatProfileResponse,
  attachIsRegistered,
};
