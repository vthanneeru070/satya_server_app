const User = require("../models/User");
const AdminLog = require("../models/AdminLog");
const Festival = require("../models/Festival");
const Pooja = require("../models/Pooja");
const Deity = require("../models/Deity");
const Donation = require("../models/Donation");
const DailySloka = require("../models/DailySloka");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");

/**
 * List admin users (paginated). Excludes soft-deleted unless `?includeDeleted=true`.
 * NOTE: This now lists role: "admin" (regular admins) — superadmins are listed separately
 * via the same query plus `?role=superadmin` if needed (see filter).
 */
const getAdminUsers = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const includeDeleted = req.query.includeDeleted === "true";
    const roleFilter = req.query.role === "superadmin" ? "superadmin" : "admin";

    const filter = { role: roleFilter };
    if (!includeDeleted) filter.isDeleted = { $ne: true };

    if (search) {
      filter.email = { $regex: search, $options: "i" };
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
      "Admin users fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const getRegularUsers = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const includeDeleted = req.query.includeDeleted === "true";
    const filter = { role: "user" };
    if (!includeDeleted) filter.isDeleted = { $ne: true };

    if (search) {
      filter.email = { $regex: search, $options: "i" };
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select("-__v"),
      User.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Regular users fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

/**
 * Remove admin role from a user (super-admin only).
 * Cannot demote a superadmin. Cleans canLoginAdminPanel + createdBy on demote.
 */
const removeAdmin = async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      throw new HttpError("User not found", 404);
    }

    if (targetUser.role === "superadmin") {
      throw new HttpError("Super admin role cannot be removed", 400);
    }

    if (targetUser.role !== "admin") {
      return sendSuccess(res, { user: targetUser }, "User is not an admin");
    }

    targetUser.role = "user";
    targetUser.canLoginAdminPanel = false;
    targetUser.createdBy = null;
    await targetUser.save();

    await AdminLog.create({
      action: "remove_admin",
      performedBy: req.user.userId,
      targetUser: targetUser._id,
    });

    return sendSuccess(res, { user: targetUser }, "Admin role removed successfully");
  } catch (error) {
    return next(error);
  }
};

/**
 * Soft-delete a user. Cannot delete admins or superadmins.
 * Clears their FCM tokens and revokes admin-panel access (defensive).
 */
const deleteUser = async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      throw new HttpError("User not found", 404);
    }

    if (targetUser.role === "admin" || targetUser.role === "superadmin") {
      throw new HttpError("Admin/super-admin accounts cannot be deleted from here", 400);
    }

    if (targetUser.isDeleted) {
      return sendSuccess(res, { user: targetUser }, "User is already deleted");
    }

    targetUser.isDeleted = true;
    targetUser.fcmTokens = [];
    targetUser.canLoginAdminPanel = false;
    await targetUser.save();

    await AdminLog.create({
      action: "delete_user",
      performedBy: req.user.userId,
      targetUser: targetUser._id,
    });
    return sendSuccess(res, { user: targetUser }, "User soft-deleted successfully");
  } catch (error) {
    return next(error);
  }
};

const restoreUser = async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      throw new HttpError("User not found", 404);
    }

    if (!targetUser.isDeleted) {
      return sendSuccess(res, { user: targetUser }, "User is not deleted");
    }

    targetUser.isDeleted = false;
    targetUser.accountDeletionComment = null;
    targetUser.accountDeletedAt = null;
    await targetUser.save();

    await AdminLog.create({
      action: "restore_user",
      performedBy: req.user.userId,
      targetUser: targetUser._id,
    });

    return sendSuccess(res, { user: targetUser }, "User restored successfully");
  } catch (error) {
    return next(error);
  }
};

const getTodayDateKey = () => {
  const now = new Date();
  const day = String(now.getUTCDate()).padStart(2, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const year = now.getUTCFullYear();
  return `${day}-${month}-${year}`;
};

const getStatusCounts = async (Model, statuses) => {
  const counts = await Promise.all(statuses.map((status) => Model.countDocuments({ status })));
  return statuses.reduce((acc, status, index) => {
    acc[status] = counts[index];
    return acc;
  }, {});
};

const getAdminDashboard = async (_req, res, next) => {
  try {
    const statusKeys = ["PENDING", "APPROVED", "REJECTED"];
    const todayDateKey = getTodayDateKey();
    const now = new Date();
    const todayStartUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const tomorrowStartUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );

    const [
      usersCount,
      adminsCount,
      superAdminsCount,
      todayActiveUsers,
      festivalCounts,
      poojaCounts,
      deityCounts,
      donationCounts,
      todaySloka,
    ] = await Promise.all([
      User.countDocuments({ role: "user", isDeleted: { $ne: true } }),
      User.countDocuments({ role: "admin", isDeleted: { $ne: true } }),
      User.countDocuments({ role: "superadmin", isDeleted: { $ne: true } }),
      User.countDocuments({
        role: "user",
        isDeleted: { $ne: true },
        lastActiveAt: { $gte: todayStartUtc, $lt: tomorrowStartUtc },
      }),
      getStatusCounts(Festival, statusKeys),
      getStatusCounts(Pooja, statusKeys),
      getStatusCounts(Deity, statusKeys),
      getStatusCounts(Donation, statusKeys),
      DailySloka.findOne({ dateKey: todayDateKey }).select("-__v").populate("createdBy", "email role"),
    ]);

    return sendSuccess(
      res,
      {
        usersCount,
        adminsCount,
        superAdminsCount,
        todayActiveUsers,
        festivals: festivalCounts,
        poojas: poojaCounts,
        deities: deityCounts,
        donations: donationCounts,
        todaySloka,
      },
      "Admin dashboard fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAdminUsers,
  getRegularUsers,
  removeAdmin,
  deleteUser,
  restoreUser,
  getAdminDashboard,
};
