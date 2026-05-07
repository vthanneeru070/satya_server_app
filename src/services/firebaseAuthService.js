const crypto = require("crypto");
const admin = require("../config/firebase");

/**
 * Generates a strong temporary password used only at Firebase user creation.
 * The new admin will replace it via the password-reset link.
 */
const generateTemporaryPassword = () => {
  // 16 bytes (~128 bits) hex => guaranteed to satisfy Firebase's 6-char min.
  return crypto.randomBytes(16).toString("hex");
};

/**
 * Create a Firebase Auth user (email/password). Used for dedicated admin accounts.
 *
 * Throws Firebase errors with code "auth/email-already-exists" if duplicate.
 * Caller MUST handle rollback (deleteFirebaseUser) if subsequent Mongo write fails.
 */
const createFirebaseUser = async ({ email, password, displayName, phoneNumber }) => {
  const params = {
    email,
    password,
    emailVerified: false,
    disabled: false,
  };
  if (displayName) params.displayName = displayName;
  if (phoneNumber) params.phoneNumber = phoneNumber;

  return admin.auth().createUser(params);
};

/**
 * Permanently delete a Firebase Auth user. Used for rollback when Mongo write fails.
 */
const deleteFirebaseUser = async (uid) => {
  if (!uid) return;
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    // Log but don't rethrow — best-effort cleanup.
    console.error(`[firebaseAuthService] Failed to rollback Firebase user ${uid}:`, err.message);
  }
};

/**
 * Generate a password reset link the admin will use to set their initial password.
 * Optional `actionCodeSettings` lets you control the redirect URL after reset.
 */
const generatePasswordResetLink = async (email, actionCodeSettings) => {
  return admin.auth().generatePasswordResetLink(email, actionCodeSettings);
};

/**
 * Verify a Firebase ID token (used by /auth/login and /auth/admin-login).
 * Re-exported here so controllers don't need to know about firebase-admin internals.
 */
const verifyIdToken = async (idToken) => {
  return admin.auth().verifyIdToken(idToken);
};

module.exports = {
  generateTemporaryPassword,
  createFirebaseUser,
  deleteFirebaseUser,
  generatePasswordResetLink,
  verifyIdToken,
};
