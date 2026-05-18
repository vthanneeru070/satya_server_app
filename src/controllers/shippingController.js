const { sendSuccess } = require("../utils/response");
const shippingQuoteService = require("../services/shippingQuoteService");
const { tcgEnabled } = require("../config/courierGuy");

const getQuotes = async (req, res, next) => {
  try {
    if (!tcgEnabled) {
      return sendSuccess(
        res,
        {
          enabled: false,
          message:
            "Courier Guy is not configured. Set TCG_API_KEY and warehouse address env vars.",
        },
        "Shipping quotes unavailable"
      );
    }
    const data = await shippingQuoteService.getDeliveryQuotes(req.user.userId, req.body);
    return sendSuccess(res, { enabled: true, ...data }, "Delivery options fetched");
  } catch (error) {
    return next(error);
  }
};

module.exports = { getQuotes };
