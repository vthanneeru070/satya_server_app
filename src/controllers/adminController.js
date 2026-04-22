const User = require("../models/User");
const AdminLog = require("../models/AdminLog");
const Festival = require("../models/Festival");
const Pooja = require("../models/Pooja");
const Donation = require("../models/Donation");
const DailySloka = require("../models/DailySloka");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");

const createAdmin = async (req, res, next) => {
  try {
    const normalizedEmail = req.body.email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      throw new HttpError("User not found", 404);
    }

    if (user.role === "admin") {
      return sendSuccess(res, { user }, "User is already an admin");
    }

    user.role = "admin";
    user.createdBy = req.user.userId;
    await user.save();

    await AdminLog.create({
      action: "create_admin",
      performedBy: req.user.userId,
      targetUser: user._id,
    });

    return sendSuccess(res, { user }, "User promoted to admin");
  } catch (error) {
    return next(error);
  }
};

const getAdminUsers = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const filter = { role: "admin" };

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
    const filter = { role: "user" };

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

const removeAdmin = async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      throw new HttpError("User not found", 404);
    }

    if (targetUser.isSuperAdmin) {
      throw new HttpError("Super admin role cannot be removed", 400);
    }

    if (targetUser.role !== "admin") {
      return sendSuccess(res, { user: targetUser }, "User is not an admin");
    }

    targetUser.role = "user";
    targetUser.isSuperAdmin = false;
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

const deleteUser = async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      throw new HttpError("User not found", 404);
    }

    if (targetUser.role === "admin" || targetUser.isSuperAdmin) {
      throw new HttpError("Admin users cannot be deleted", 400);
    }

    await targetUser.deleteOne();
    await AdminLog.create({
      action: "delete_user",
      performedBy: req.user.userId,
      targetUser: targetUser._id,
    });
    return sendSuccess(res, { user: targetUser }, "User deleted successfully");
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
      todayActiveUsers,
      festivalCounts,
      poojaCounts,
      donationCounts,
      todaySloka,
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({
        role: "user",
        lastActiveAt: { $gte: todayStartUtc, $lt: tomorrowStartUtc },
      }),
      getStatusCounts(Festival, statusKeys),
      getStatusCounts(Pooja, statusKeys),
      getStatusCounts(Donation, statusKeys),
      DailySloka.findOne({ dateKey: todayDateKey }).select("-__v").populate("createdBy", "email role"),
    ]);

    return sendSuccess(
      res,
      {
        usersCount,
        adminsCount,
        todayActiveUsers,
        festivals: festivalCounts,
        poojas: poojaCounts,
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
  createAdmin,
  getAdminUsers,
  getRegularUsers,
  removeAdmin,
  deleteUser,
  getAdminDashboard,
};
