const jwt = require("jsonwebtoken");
const admin = require("../config/firebase");
const { jwtRefreshSecret } = require("../config/env");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const { generateAccessToken, generateRefreshToken } = require("../utils/jwt");
const userProfileService = require("../services/userProfileService");
const { attachIsRegistered, normalizeZodiacSign } = require("../utils/userProfile");
const userStreakService = require("../services/userStreakService");

const toProviderValue = (provider = "") => {
  const normalized = String(provider || "").toLowerCase();
  if (normalized.includes("google")) return "google";
  if (normalized.includes("apple")) return "apple";
  if (normalized.includes("email") || normalized.includes("password")) return "password";
  return null;
};

const getProvider = (decodedToken) => {
  const providerFromSignIn = toProviderValue(decodedToken.firebase?.sign_in_provider);
  return providerFromSignIn || "password";
};

const getLinkedProviders = (decodedToken) => {
  const identities = decodedToken.firebase?.identities || {};
  const candidates = [
    decodedToken.firebase?.sign_in_provider,
    ...Object.keys(identities),
  ];

  const normalizedProviders = Array.from(
    new Set(candidates.map(toProviderValue).filter(Boolean))
  );

  if (!normalizedProviders.length) {
    return ["password"];
  }

  return normalizedProviders;
};

const toTrimmedOrNull = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeProviderCandidates = (providers = []) =>
  Array.from(new Set((Array.isArray(providers) ? providers : []).map(toProviderValue).filter(Boolean)));

const parseFirebaseTokenFromHeader = (req) => {
  const authorizationHeader = req.headers.authorization || "";
  const [scheme, firebaseIdToken] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !firebaseIdToken) {
    throw new HttpError("Firebase ID token is required in Authorization header", 400);
  }

  return firebaseIdToken;
};

const buildAuthPayload = (user, tokens, streak = null) => {
  const userWithFlag = attachIsRegistered(user);
  return {
    user: userWithFlag,
    isRegistered: userWithFlag.isRegistered,
    streak,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
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
    const requestedUser = req.body?.user || {};
    const firebaseIdToken = parseFirebaseTokenFromHeader(req);

    const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
    const firebaseUid = decodedToken.uid;
    const provider = getProvider(decodedToken);
    const linkedProvidersFromToken = getLinkedProviders(decodedToken);
    const linkedProvidersFromBody = normalizeProviderCandidates(requestedUser.providers);
    const linkedProviders = Array.from(
      new Set([...linkedProvidersFromToken, ...linkedProvidersFromBody])
    );

    const profile = {
      email: toTrimmedOrNull(requestedUser.email) || decodedToken.email || null,
      phone: toTrimmedOrNull(requestedUser.phoneNumber) || decodedToken.phone_number || null,
      fullName: toTrimmedOrNull(requestedUser.fullName),
      firstName: toTrimmedOrNull(requestedUser.firstName),
      lastName: toTrimmedOrNull(requestedUser.lastName),
      gender: toTrimmedOrNull(requestedUser.gender),
      sunSign: normalizeZodiacSign(requestedUser.sunSign),
      moonSign: normalizeZodiacSign(requestedUser.moonSign),
      photoUrl: toTrimmedOrNull(requestedUser.photoUrl),
      emailVerified: requestedUser.emailVerified ?? decodedToken.email_verified ?? false,
    };

    if (requestedUser.firebaseUid && requestedUser.firebaseUid !== firebaseUid) {
      throw new HttpError("firebaseUid does not match token user", 400);
    }

    let user = await User.findOne({ firebaseUid });

    // SECURITY: end-user login MUST NOT be usable by admins/superadmins.
    // Dedicated admin accounts can only authenticate via /auth/admin-login.
    if (user && (user.role === "admin" || user.role === "superadmin")) {
      throw new HttpError(
        "This account is an admin. Use the admin panel login at /auth/admin-login.",
        403
      );
    }

    if (user && user.isDeleted) {
      throw new HttpError("Account has been deleted.", 403);
    }

    if (!user) {
      user = await User.create({
        firebaseUid,
        phone: profile.phone,
        email: profile.email,
        fullName: profile.fullName,
        firstName: profile.firstName,
        lastName: profile.lastName,
        gender: profile.gender,
        sunSign: profile.sunSign,
        moonSign: profile.moonSign,
        photoUrl: profile.photoUrl,
        emailVerified: profile.emailVerified,
        provider,
        linkedProviders,
        role: "user",
        canLoginAdminPanel: false,
      });
    } else {
      let hasUpdates = false;
      const mergedLinkedProviders = Array.from(
        new Set([...(user.linkedProviders || []), ...linkedProviders])
      );

      if (provider && user.provider !== provider) {
        user.provider = provider;
        hasUpdates = true;
      }

      if (JSON.stringify(mergedLinkedProviders) !== JSON.stringify(user.linkedProviders || [])) {
        user.linkedProviders = mergedLinkedProviders;
        hasUpdates = true;
      }

      if (profile.email && user.email !== profile.email) {
        user.email = profile.email;
        hasUpdates = true;
      }

      if (profile.phone && user.phone !== profile.phone) {
        user.phone = profile.phone;
        hasUpdates = true;
      }

      if (profile.fullName && user.fullName !== profile.fullName) {
        user.fullName = profile.fullName;
        hasUpdates = true;
      }

      if (profile.firstName && user.firstName !== profile.firstName) {
        user.firstName = profile.firstName;
        hasUpdates = true;
      }

      if (profile.lastName && user.lastName !== profile.lastName) {
        user.lastName = profile.lastName;
        hasUpdates = true;
      }

      if (profile.gender && user.gender !== profile.gender) {
        user.gender = profile.gender;
        hasUpdates = true;
      }

      if (profile.sunSign && user.sunSign !== profile.sunSign) {
        user.sunSign = profile.sunSign;
        hasUpdates = true;
      }

      if (profile.moonSign && user.moonSign !== profile.moonSign) {
        user.moonSign = profile.moonSign;
        hasUpdates = true;
      }

      if (profile.photoUrl && user.photoUrl !== profile.photoUrl) {
        user.photoUrl = profile.photoUrl;
        hasUpdates = true;
      }

      if (typeof profile.emailVerified === "boolean" && user.emailVerified !== profile.emailVerified) {
        user.emailVerified = profile.emailVerified;
        hasUpdates = true;
      }

      if (hasUpdates) {
        await user.save();
      }
    }

    user.lastActiveAt = new Date();
    await user.save();

    const streak = await userStreakService.recordDailyAppOpen(user._id);
    const tokens = await issueTokens(user);

    return sendSuccess(res, buildAuthPayload(user, tokens, streak), "Login successful");
  } catch (error) {
    if (error.code && String(error.code).startsWith("auth/")) {
      return next(new HttpError("Invalid Firebase ID token", 401));
    }
    console.log(error);
    return next(error);
  }
};

/**
 * Admin Panel login.
 *
 * Strictly enforces:
 *   - role must be "admin" or "superadmin"
 *   - canLoginAdminPanel must be true
 *   - account must NOT be soft-deleted
 *   - Firebase sign-in provider must be "password" (Google/Apple are user-only)
 */
const adminLogin = async (req, res, next) => {
  try {
    const firebaseIdToken = parseFirebaseTokenFromHeader(req);
    const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
    const provider = getProvider(decodedToken);

    if (provider !== "password") {
      throw new HttpError(
        "Admin accounts must sign in with email/password only.",
        403
      );
    }

    const user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (!user) {
      throw new HttpError("Admin account not found.", 404);
    }

    if (user.isDeleted) {
      throw new HttpError("Account has been deleted.", 403);
    }

    if (user.role !== "admin" && user.role !== "superadmin") {
      throw new HttpError("Admin access denied", 403);
    }

    if (!user.canLoginAdminPanel) {
      throw new HttpError(
        "This account is not permitted to access the admin panel.",
        403
      );
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
    const data = await userProfileService.getProfile(req.user.userId);
    return sendSuccess(res, data, "Profile fetched successfully");
  } catch (error) {
    return next(error);
  }
};

/** First-time registration (required profile fields; optional image). */
const createProfile = async (req, res, next) => {
  try {
    const data = await userProfileService.createProfile(req.user.userId, req.body, req);
    return sendSuccess(res, data, "Profile created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

/** Update profile (partial fields; optional new image). */
const editProfile = async (req, res, next) => {
  try {
    const data = await userProfileService.editProfile(req.user.userId, req.body, req);
    return sendSuccess(res, data, "Profile updated successfully");
  } catch (error) {
    return next(error);
  }
};

/** Soft-delete account (requires comment) and revoke refresh tokens. */
const deleteAccount = async (req, res, next) => {
  try {
    const result = await userProfileService.deleteAccount(req.user.userId, req.body);
    return sendSuccess(res, result, "Account deleted successfully");
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
  createProfile,
  editProfile,
  deleteAccount,
};
