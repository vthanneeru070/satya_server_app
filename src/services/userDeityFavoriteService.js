const User = require("../models/User");
const Deity = require("../models/Deity");
const HttpError = require("../utils/httpError");

const DEITY_PUBLIC_FILTER = { status: "APPROVED" };

const assertMobileUser = (user) => {
  if (!user || user.isDeleted) throw new HttpError("User not found", 404);
  if (user.role === "admin" || user.role === "superadmin") {
    throw new HttpError("This endpoint is for mobile app users only", 403);
  }
};

const loadMobileUser = async (userId) => {
  const user = await User.findById(userId);
  assertMobileUser(user);
  return user;
};

const assertApprovedDeity = async (deityId) => {
  const deity = await Deity.findOne({ _id: deityId, ...DEITY_PUBLIC_FILTER }).select("_id name");
  if (!deity) {
    throw new HttpError("Deity not found or not available", 404);
  }
  return deity;
};

const listFavoriteDeities = async (userId) => {
  const user = await User.findById(userId)
    .select("favoriteDeities")
    .populate({
      path: "favoriteDeities",
      match: DEITY_PUBLIC_FILTER,
      populate: { path: "pujas", select: "title status" },
    });

  assertMobileUser(user);

  const deities = (user.favoriteDeities || []).filter(Boolean);
  return {
    deities,
    favoriteDeityIds: deities.map((d) => String(d._id)),
    count: deities.length,
  };
};

const addFavoriteDeity = async (userId, deityId) => {
  await assertApprovedDeity(deityId);

  const before = await User.findById(userId).select("favoriteDeities");
  assertMobileUser(before);
  const hadFavorite = (before.favoriteDeities || []).some(
    (id) => String(id) === String(deityId)
  );

  const user = await User.findOneAndUpdate(
    { _id: userId, isDeleted: { $ne: true }, role: "user" },
    { $addToSet: { favoriteDeities: deityId } },
    { new: true }
  ).select("favoriteDeities");

  if (!user) throw new HttpError("User not found", 404);

  return {
    deityId: String(deityId),
    favoriteDeityIds: user.favoriteDeities.map(String),
    added: !hadFavorite,
  };
};

const removeFavoriteDeity = async (userId, deityId) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, isDeleted: { $ne: true }, role: "user" },
    { $pull: { favoriteDeities: deityId } },
    { new: true }
  ).select("favoriteDeities");

  if (!user) throw new HttpError("User not found", 404);

  return {
    deityId: String(deityId),
    favoriteDeityIds: user.favoriteDeities.map(String),
    removed: true,
  };
};

module.exports = {
  listFavoriteDeities,
  addFavoriteDeity,
  removeFavoriteDeity,
};
