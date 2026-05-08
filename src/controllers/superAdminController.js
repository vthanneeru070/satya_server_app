const User = require("../models/User");
const AdminLog = require("../models/AdminLog");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const {
  generateTemporaryPassword,
  createFirebaseUser,
  deleteFirebaseUser,
  generatePasswordResetLink,
} = require("../services/firebaseAuthService");
const {
  sendAdminInviteEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");

/**
 * If ADMIN_PANEL_URL is set, the password-reset link will redirect there after
 * the admin sets their password (better UX than landing on Firebase's default page).
 */
const buildResetActionCodeSettings = () => {
  const url = process.env.ADMIN_PANEL_URL;
  if (!url) return undefined;
  return { url, handleCodeInApp: false };
};

/**
 * Create a dedicated admin account.
 *
 * Flow:
 *   1. Validate caller is superadmin (route middleware).
 *   2. Check duplicate email in MongoDB.
 *   3. Generate a strong temporary password.
 *   4. Create the Firebase Auth user (provider=password).
 *   5. Persist the user in MongoDB with role=admin, canLoginAdminPanel=true.
 *      → If Mongo save fails, roll back the Firebase user.
 *   6. Generate a password reset link the admin uses to pick their real password.
 *   7. Audit-log the action.
 *
 * The temporary password is NEVER returned to the caller. Only the reset link is.
 */
const createDedicatedAdmin = async (req, res, next) => {
  let firebaseUid;
  try {
    const { fullName, email, phone } = req.body;
    const normalizedEmail = String(email).toLowerCase().trim();

    // 1) Duplicate-email guard against any existing user (any role, any state).
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new HttpError(
        `An account with email "${normalizedEmail}" already exists.`,
        409
      );
    }

    // 2) Create Firebase Auth user.
    const tempPassword = generateTemporaryPassword();
    let firebaseUser;
    try {
      firebaseUser = await createFirebaseUser({
        email: normalizedEmail,
        password: tempPassword,
        displayName: fullName,
        phoneNumber: phone,
      });
    } catch (firebaseErr) {
      if (firebaseErr.code === "auth/email-already-exists") {
        throw new HttpError(
          `Firebase already has an account for "${normalizedEmail}".`,
          409
        );
      }
      if (firebaseErr.code === "auth/invalid-phone-number") {
        throw new HttpError("Invalid phone number for Firebase Auth.", 400);
      }
      throw new HttpError(
        firebaseErr.message || "Failed to create Firebase user.",
        500
      );
    }

    firebaseUid = firebaseUser.uid;

    // 3) Persist in MongoDB. Roll back Firebase user on failure.
    let mongoUser;
    try {
      mongoUser = await User.create({
        firebaseUid,
        email: normalizedEmail,
        phone: phone || null,
        fullName,
        provider: "password",
        linkedProviders: ["password"],
        role: "admin",
        canLoginAdminPanel: true,
        createdBy: req.user.userId,
      });
    } catch (mongoErr) {
      await deleteFirebaseUser(firebaseUid);
      if (mongoErr.code === 11000) {
        throw new HttpError(
          "Duplicate user. A record with this email/uid already exists.",
          409
        );
      }
      throw mongoErr;
    }

    // 4) Generate the password reset link (with optional continue URL → admin panel).
    let passwordResetLink = null;
    let resetLinkError = null;
    try {
      passwordResetLink = await generatePasswordResetLink(
        normalizedEmail,
        buildResetActionCodeSettings()
      );
    } catch (linkErr) {
      // Non-fatal: the admin can request a fresh reset link from the panel.
      const code = linkErr?.code || linkErr?.errorInfo?.code;
      resetLinkError = code ? `${code}: ${linkErr.message}` : linkErr.message;
      console.error(
        "[superAdminController] Failed to generate reset link:",
        resetLinkError
      );
    }

    // 5) Email the invite to the new admin (non-blocking — don't fail the request).
    let emailDelivered = false;
    let emailDryRun = false;
    let emailMessageId = null;
    let emailError = null;
    if (passwordResetLink) {
      try {
        const mailResult = await sendAdminInviteEmail({
          to: normalizedEmail,
          fullName,
          resetLink: passwordResetLink,
        });
        emailDryRun = !!mailResult?.dryRun;
        emailDelivered = !!mailResult?.delivered && !mailResult?.dryRun;
        emailMessageId = mailResult?.messageId || null;
        if (emailDryRun) {
          console.warn(
            "[superAdminController] Invite email skipped (SMTP not configured). API still returned passwordResetLink."
          );
        }
      } catch (mailErr) {
        emailError = mailErr.message;
        console.error("[superAdminController] Failed to send invite email:", mailErr.message);
      }
    }

    // 6) Audit log.
    await AdminLog.create({
      action: "create_dedicated_admin",
      performedBy: req.user.userId,
      targetUser: mongoUser._id,
    });

    return sendSuccess(
      res,
      {
        admin: mongoUser,
        passwordResetLink,
        resetLinkError,
        emailDelivered,
        emailDryRun,
        emailMessageId,
        emailError,
      },
      emailDelivered
        ? `Dedicated admin created. Invitation email sent to ${normalizedEmail}.`
        : emailDryRun
          ? "Dedicated admin created. SMTP is not configured on the server — no email was sent. Add SMTP_* env vars or share passwordResetLink manually."
          : passwordResetLink
            ? "Dedicated admin created. Email delivery failed — share passwordResetLink manually."
            : `Dedicated admin created, but could not generate password reset link${
                resetLinkError ? `: ${resetLinkError}` : ""
              }.`,
      201
    );
  } catch (error) {
    return next(error);
  }
};

/**
 * Re-issue a password reset link for an existing admin AND email it to them.
 * The link is also returned in the response (so the super-admin can copy/share manually).
 */
const resendPasswordResetLink = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) throw new HttpError("Admin not found", 404);
    if (target.role !== "admin" && target.role !== "superadmin") {
      throw new HttpError("Target user is not an admin", 400);
    }
    if (!target.email) {
      throw new HttpError("Target admin has no email on file", 400);
    }

    let passwordResetLink = null;
    try {
      passwordResetLink = await generatePasswordResetLink(
        target.email,
        buildResetActionCodeSettings()
      );
    } catch (linkErr) {
      const code = linkErr?.code || linkErr?.errorInfo?.code;
      throw new HttpError(
        code
          ? `Failed to generate password reset link (${code}): ${linkErr.message}`
          : `Failed to generate password reset link: ${linkErr.message}`,
        500
      );
    }

    let emailDelivered = false;
    let emailDryRun = false;
    let emailMessageId = null;
    let emailError = null;
    try {
      const mailResult = await sendPasswordResetEmail({
        to: target.email,
        fullName: target.fullName,
        resetLink: passwordResetLink,
      });
      emailDryRun = !!mailResult?.dryRun;
      emailDelivered = !!mailResult?.delivered && !mailResult?.dryRun;
      emailMessageId = mailResult?.messageId || null;
    } catch (mailErr) {
      emailError = mailErr.message;
      console.error("[superAdminController] Failed to send reset email:", mailErr.message);
    }

    return sendSuccess(
      res,
      { passwordResetLink, emailDelivered, emailDryRun, emailMessageId, emailError },
      emailDelivered
        ? `Password reset link emailed to ${target.email}.`
        : emailDryRun
          ? "Password reset link generated. SMTP not configured — no email sent."
          : "Password reset link generated. Email delivery failed — share manually."
    );
  } catch (error) {
    return next(error);
  }
};

/**
 * (Convenience) Toggle canLoginAdminPanel for an admin without removing the role.
 * Useful for temporary suspension.
 */
const setAdminPanelAccess = async (req, res, next) => {
  try {
    const { canLoginAdminPanel } = req.body;
    if (typeof canLoginAdminPanel !== "boolean") {
      throw new HttpError("canLoginAdminPanel must be a boolean", 400);
    }

    const target = await User.findById(req.params.id);
    if (!target) throw new HttpError("Admin not found", 404);
    if (target.role !== "admin" && target.role !== "superadmin") {
      throw new HttpError("Target user is not an admin", 400);
    }
    if (target.role === "superadmin" && canLoginAdminPanel === false) {
      throw new HttpError("Cannot revoke admin-panel access from a superadmin", 400);
    }

    target.canLoginAdminPanel = canLoginAdminPanel;
    await target.save();

    return sendSuccess(res, { admin: target }, "Admin panel access updated");
  } catch (error) {
    return next(error);
  }
};

const listAdmins = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const includeDeleted = req.query.includeDeleted === true || req.query.includeDeleted === "true";

    const filter = { role: { $in: ["admin", "superadmin"] } };
    if (!includeDeleted) filter.isDeleted = { $ne: true };
    if (search) filter.email = { $regex: search, $options: "i" };

    const [admins, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-__v")
        .populate("createdBy", "email role"),
      User.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        admins,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Admins fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createDedicatedAdmin,
  resendPasswordResetLink,
  setAdminPanelAccess,
  listAdmins,
};
