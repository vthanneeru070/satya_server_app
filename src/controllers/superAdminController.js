const User = require("../models/User");
const AdminLog = require("../models/AdminLog");
const RefreshToken = require("../models/RefreshToken");
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

    // 1) Duplicate-email guard. If a previous request was canceled mid-way and
    //    already created the user, allow this call to "resume" and re-send the
    //    invite instead of failing with 409 — but only if the user matches what
    //    the caller is creating (admin role, same email).
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      const isResumable =
        existing.role === "admin" &&
        existing.canLoginAdminPanel === true &&
        !existing.isDeleted;

      if (!isResumable) {
        throw new HttpError(
          `An account with email "${normalizedEmail}" already exists.`,
          409
        );
      }

      // RESUME PATH — admin already exists; just regenerate link and email.
      let resumePasswordResetLink = null;
      let resumeResetLinkError = null;
      try {
        resumePasswordResetLink = await generatePasswordResetLink(
          normalizedEmail,
          buildResetActionCodeSettings()
        );
      } catch (linkErr) {
        const code = linkErr?.code || linkErr?.errorInfo?.code;
        resumeResetLinkError = code
          ? `${code}: ${linkErr.message}`
          : linkErr.message;
        console.error(
          "[superAdminController] (resume) Failed to generate reset link:",
          resumeResetLinkError
        );
      }

      // Fire-and-forget email — do NOT block the response.
      if (resumePasswordResetLink) {
        console.log(
          `[superAdminController] (resume) Dispatching invite email to ${normalizedEmail}`
        );
        sendAdminInviteEmail({
          to: normalizedEmail,
          fullName: existing.fullName || fullName,
          resetLink: resumePasswordResetLink,
        })
          .then((result) => {
            if (result?.dryRun) {
              console.warn(
                "[superAdminController] (resume) Email skipped — SMTP not configured."
              );
            } else {
              console.log(
                `[superAdminController] (resume) Invite email DELIVERED. messageId=${result?.messageId} accepted=${JSON.stringify(result?.accepted)}`
              );
            }
          })
          .catch((mailErr) => {
            console.error(
              "[superAdminController] (resume) Failed to send invite email:",
              mailErr?.code || "",
              mailErr?.message,
              mailErr?.response || ""
            );
          });
      } else {
        console.warn(
          `[superAdminController] (resume) No reset link generated → email NOT sent. resetLinkError=${resumeResetLinkError}`
        );
      }

      return sendSuccess(
        res,
        {
          admin: existing,
          passwordResetLink: resumePasswordResetLink,
          resetLinkError: resumeResetLinkError,
          resumed: true,
        },
        resumePasswordResetLink
          ? `Admin already exists. New invitation email is being sent to ${normalizedEmail}.`
          : `Admin already exists, but failed to generate a new password reset link${
              resumeResetLinkError ? `: ${resumeResetLinkError}` : ""
            }.`,
        200
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

    // 5) Email the invite IN THE BACKGROUND — never block the API response on
    //    SMTP. Even with hard timeouts, a 10–15s wait is too long for a UI.
    //    The link is already in the response so the super-admin can copy/share
    //    immediately if email delivery is slow or fails.
    if (passwordResetLink) {
      console.log(
        `[superAdminController] Dispatching invite email to ${normalizedEmail}`
      );
      sendAdminInviteEmail({
        to: normalizedEmail,
        fullName,
        resetLink: passwordResetLink,
      })
        .then((result) => {
          if (result?.dryRun) {
            console.warn(
              "[superAdminController] Email skipped — SMTP not configured."
            );
          } else {
            console.log(
              `[superAdminController] Invite email DELIVERED. messageId=${result?.messageId} accepted=${JSON.stringify(result?.accepted)}`
            );
          }
        })
        .catch((mailErr) => {
          console.error(
            "[superAdminController] Failed to send invite email:",
            mailErr?.code || "",
            mailErr?.message,
            mailErr?.response || ""
          );
        });
    } else {
      console.warn(
        `[superAdminController] No reset link generated → email NOT sent. resetLinkError=${resetLinkError}`
      );
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
        emailQueued: !!passwordResetLink,
      },
      passwordResetLink
        ? `Dedicated admin created. Invitation email is being sent to ${normalizedEmail}. The reset link is also returned in the response.`
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

    // Fire-and-forget — never block the API on SMTP.
    sendPasswordResetEmail({
      to: target.email,
      fullName: target.fullName,
      resetLink: passwordResetLink,
    })
      .then((result) => {
        if (result?.dryRun) {
          console.warn(
            "[superAdminController] (resend) Email skipped — SMTP not configured."
          );
        } else {
          console.log(
            `[superAdminController] (resend) Reset email queued. messageId=${result?.messageId}`
          );
        }
      })
      .catch((mailErr) => {
        console.error(
          "[superAdminController] (resend) Failed to send reset email:",
          mailErr.message
        );
      });

    return sendSuccess(
      res,
      { passwordResetLink, emailQueued: true },
      `Password reset link generated for ${target.email}. Invitation email is being sent.`
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

/**
 * Permanently delete a dedicated admin (role=admin only).
 * Removes Firebase Auth user and MongoDB User document; revokes refresh tokens.
 */
const deleteDedicatedAdmin = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    if (String(targetId) === String(req.user.userId)) {
      throw new HttpError("You cannot delete your own account", 400);
    }

    const target = await User.findById(targetId);
    if (!target) {
      throw new HttpError("Admin not found", 404);
    }
    if (target.role === "superadmin") {
      throw new HttpError("Superadmin accounts cannot be deleted via this endpoint", 400);
    }
    if (target.role !== "admin") {
      throw new HttpError("Only dedicated admin accounts (role=admin) can be deleted here", 400);
    }

    await deleteFirebaseUser(target.firebaseUid, { strict: true });
    await RefreshToken.deleteMany({ userId: target._id });

    const deleted = await User.findByIdAndDelete(target._id);
    if (!deleted) {
      throw new HttpError("Admin not found", 404);
    }

    await AdminLog.create({
      action: "delete_dedicated_admin",
      performedBy: req.user.userId,
      targetUser: target._id,
    });

    return sendSuccess(
      res,
      {
        deletedAdmin: {
          id: String(target._id),
          email: target.email,
          fullName: target.fullName,
          firebaseUid: target.firebaseUid,
        },
        firebaseDeleted: true,
      },
      `Admin ${target.email || target._id} deleted from database and Firebase Auth`
    );
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

    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { email: { $regex: safe, $options: "i" } },
        { fullName: { $regex: safe, $options: "i" } },
        { phone: { $regex: safe, $options: "i" } },
      ];
    }

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
  deleteDedicatedAdmin,
  resendPasswordResetLink,
  setAdminPanelAccess,
  listAdmins,
};
