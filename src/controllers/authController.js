const jwt = require("jsonwebtoken");
const admin = require("../config/firebase");
const { jwtRefreshSecret } = require("../config/env");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { generateAccessToken, generateRefreshToken } = require("../utils/jwt");

const getProvider = (decodedToken) => {
  const provider = decodedToken.firebase?.sign_in_provider || "gmail/password";
  if (provider.includes("google")) return "google";
  if (provider.includes("apple")) return "apple";
  return "gmail/password";
};

const parseFirebaseTokenFromHeader = (req) => {
  const authorizationHeader = req.headers.authorization || "";
  const [scheme, firebaseIdToken] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !firebaseIdToken) {
    throw new HttpError("Firebase ID token is required in Authorization header", 400);
  }

  return firebaseIdToken;
};

const issueTokens = async (user) => {
  const accessToken = generateAccessToken({
    userId: user._id.toString(),
    role: user.role,
  });
  const refreshToken = generateRefreshToken({
    userId: user._id.toString(),
    role: user.role,
  });

  const refreshPayload = jwt.verify(refreshToken, jwtRefreshSecret);
  await RefreshToken.create({
    userId: user._id,
    token: refreshToken,
    expiryDate: new Date(refreshPayload.exp * 1000),
  });

  return { accessToken, refreshToken };
};

const login = async (req, res, next) => {
  try {
    const firebaseIdToken = parseFirebaseTokenFromHeader(req);

    const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
    const firebaseUid = decodedToken.uid;
    const provider = getProvider(decodedToken);

    let user = await User.findOne({ firebaseUid });

    if (!user) {
      user = await User.create({
        firebaseUid,
        phone: decodedToken.phone_number || null,
        email: decodedToken.email || null,
        provider,
      });
    }

    const { accessToken, refreshToken } = await issueTokens(user);

    return sendSuccess(
      res,
      {
        user,
        accessToken,
        refreshToken,
      },
      "Login successful"
    );
  } catch (error) {
    if (error.code && String(error.code).startsWith("auth/")) {
      return next(new HttpError("Invalid Firebase ID token", 401));
    }
    console.log(error);
    return next(error);
  }
};

const adminLogin = async (req, res, next) => {
  try {
    const firebaseIdToken = parseFirebaseTokenFromHeader(req);
    const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
    const user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (!user) {
      throw new HttpError("Admin user not found. Please login with /auth/login first.", 404);
    }

    if (user.role !== "admin") {
      throw new HttpError("Admin access denied", 403);
    }

    const { accessToken, refreshToken } = await issueTokens(user);
    return sendSuccess(
      res,
      {
        user,
        accessToken,
        refreshToken,
      },
      "Admin login successful"
    );
  } catch (error) {
    if (error.code && String(error.code).startsWith("auth/")) {
      console.log(error);
      return next(new HttpError("Invalid Firebase ID token", 401));
    }
    console.log(error);
    return next(error);
  }
};

const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const decoded = jwt.verify(refreshToken, jwtRefreshSecret);

    const tokenRecord = await RefreshToken.findOne({ token: refreshToken });
    if (!tokenRecord) {
      throw new HttpError("Refresh token is invalid", 401);
    }

    if (tokenRecord.expiryDate < new Date()) {
      await RefreshToken.deleteOne({ _id: tokenRecord._id });
      throw new HttpError("Refresh token has expired", 401);
    }

    const accessToken = generateAccessToken({
      userId: decoded.userId,
      role: decoded.role,
    });

    return sendSuccess(res, { accessToken }, "Access token refreshed");
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return next(new HttpError("Invalid or expired refresh token", 401));
    }
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await RefreshToken.deleteOne({ token: refreshToken });
    return sendSuccess(res, {}, "Logout successful");
  } catch (error) {
    return next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select("-__v");
    if (!user) {
      throw new HttpError("User not found", 404);
    }
    return sendSuccess(res, { user }, "Profile fetched successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  login,
  adminLogin,
  refreshAccessToken,
  logout,
  getProfile,
};
