const ecommerceSettingsService = require("../services/ecommerceSettingsService");
const { sendSuccess } = require("../utils/response");

const getEcommerceSettings = async (_req, res, next) => {
  try {
    const settings = await ecommerceSettingsService.getEcommerceSettings();
    return sendSuccess(res, { settings }, "Ecommerce settings fetched");
  } catch (error) {
    return next(error);
  }
};

const updateEcommerceSettings = async (req, res, next) => {
  try {
    const settings = await ecommerceSettingsService.updateEcommerceSettings(
      req.user.userId,
      req.body
    );
    return sendSuccess(res, { settings }, "Ecommerce settings updated");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getEcommerceSettings,
  updateEcommerceSettings,
};
