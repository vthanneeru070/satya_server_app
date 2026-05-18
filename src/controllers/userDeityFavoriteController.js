const { sendSuccess } = require("../utils/response");
const userDeityFavoriteService = require("../services/userDeityFavoriteService");

const listFavoriteDeities = async (req, res, next) => {
  try {
    const data = await userDeityFavoriteService.listFavoriteDeities(req.user.userId);
    return sendSuccess(res, data, "Favorite deities fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const addFavoriteDeity = async (req, res, next) => {
  try {
    const data = await userDeityFavoriteService.addFavoriteDeity(
      req.user.userId,
      req.params.deityId
    );
    return sendSuccess(res, data, "Deity added to favorites", 201);
  } catch (error) {
    return next(error);
  }
};

const removeFavoriteDeity = async (req, res, next) => {
  try {
    const data = await userDeityFavoriteService.removeFavoriteDeity(
      req.user.userId,
      req.params.deityId
    );
    return sendSuccess(res, data, "Deity removed from favorites");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listFavoriteDeities,
  addFavoriteDeity,
  removeFavoriteDeity,
};
