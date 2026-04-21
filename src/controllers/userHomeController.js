const DailySloka = require("../models/DailySloka");
const Pooja = require("../models/Pooja");
const Festival = require("../models/Festival");
const Donation = require("../models/Donation");
const { sendSuccess } = require("../utils/response");

const getTodayDateKey = () => {
  const now = new Date();
  const day = String(now.getUTCDate()).padStart(2, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const year = now.getUTCFullYear();
  return `${day}-${month}-${year}`;
};

const getUserHome = async (_req, res, next) => {
  try {
    const now = new Date();
    const todayStartUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const todayDateKey = getTodayDateKey();

    const [dailySloka, poojas, festivals, donations] = await Promise.all([
      DailySloka.findOne({ dateKey: todayDateKey }).populate("createdBy", "email role"),
      Pooja.find({ status: "APPROVED" })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("createdBy", "email role"),
      Festival.find({
        date: { $gte: todayStartUtc },
        status: "APPROVED",
        isDeleted: false,
      })
        .sort({ date: 1 })
        .limit(5)
        .populate("createdBy", "email role"),
      Donation.find({ status: "APPROVED"})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("createdBy", "email role"),
    ]);

    return sendSuccess(
      res,
      {
        dailySloka,
        poojas,
        festivals,
        donations,
      },
      "User home data fetched successfully"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getUserHome,
};
