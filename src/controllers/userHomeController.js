const mongoose = require("mongoose");
const DailySloka = require("../models/DailySloka");
const Pooja = require("../models/Pooja");
const Festival = require("../models/Festival");
const Donation = require("../models/Donation");
const UserPoojaSession = require("../models/UserPoojaSession");
const UserRitualSession = require("../models/UserRitualSession");
const userStreakService = require("../services/userStreakService");
const productService = require("../services/productService");
const { sendSuccess } = require("../utils/response");
const {
  resolveRequestTimeZone,
  getCalendarDayUtcRangeForTimeZone,
} = require("../utils/timezone");
const { buildScheduledOrDailyPoojaFilter } = require("../utils/poojaDaily");
const { getTodayPanchang } = require("../services/panchangService");

const populatePooja = (query) =>
  query.populate("createdBy", "email role").populate("deity", "name deity_color");

/**
 * Distinct finished content for a user, only counting sessions whose related
 * pooja/ritual document still exists and is not soft-deleted.
 * Avoids inflated achievement counts from orphaned / deleted content refs.
 */
const countDistinctFinishedRefs = async ({
  SessionModel,
  userId,
  refField,
  collectionName,
}) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const rows = await SessionModel.aggregate([
    {
      $match: {
        user: userObjectId,
        status: "FINISHED",
        isDeleted: { $ne: true },
        [refField]: { $ne: null },
      },
    },
    {
      $lookup: {
        from: collectionName,
        localField: refField,
        foreignField: "_id",
        as: "refDoc",
      },
    },
    { $unwind: "$refDoc" },
    { $match: { "refDoc.isDeleted": { $ne: true } } },
    { $group: { _id: `$${refField}` } },
    { $count: "count" },
  ]);
  return rows[0]?.count || 0;
};

const getCompletedCounts = async (userId) => {
  const [completedPujasCount, completedRitualsCount] = await Promise.all([
    countDistinctFinishedRefs({
      SessionModel: UserPoojaSession,
      userId,
      refField: "pooja",
      collectionName: "poojas",
    }),
    countDistinctFinishedRefs({
      SessionModel: UserRitualSession,
      userId,
      refField: "ritual",
      collectionName: "rituals",
    }),
  ]);

  return {
    completedPujasCount,
    completedRitualsCount,
  };
};

const getStreakForHome = async (userId, timezone) => {
  try {
    return await userStreakService.getStreakStatus(userId, { timeZone: timezone });
  } catch {
    return null;
  }
};

const getPersonalizedHomeData = async (userId, timezone) => {
  const [completedCounts, streak] = await Promise.all([
    getCompletedCounts(userId),
    getStreakForHome(userId, timezone),
  ]);

  return {
    ...completedCounts,
    streak,
  };
};

const getUserHome = async (req, res, next) => {
  try {
    const timezone = resolveRequestTimeZone(req);
    const { startUtc, nextDayStartUtc, dateKey: todayDateKey } =
      getCalendarDayUtcRangeForTimeZone(timezone);
    const panchang = getTodayPanchang(timezone);

    const poojaFilter = {
      status: "APPROVED",
      ...buildScheduledOrDailyPoojaFilter({ fromUtc: startUtc }),
    };

    const festivalFilter = {
      status: "APPROVED",
      isVisible: true,
      isDeleted: false,
      $or: [{ date: { $gte: startUtc } }, { endDate: { $gte: startUtc } }],
    };

    const [dailySloka, dailyPoojas, poojas, festivals, donations, featuredProducts, personalized] =
      await Promise.all([
      DailySloka.findOne({
        $or: [
          { dateKey: todayDateKey },
          { date: { $gte: startUtc, $lt: nextDayStartUtc } },
        ],
      })
        .sort({ date: -1 })
        .populate("createdBy", "email role"),
      populatePooja(Pooja.find({ status: "APPROVED", daily: true }).sort({ createdAt: -1 })),
      populatePooja(
        Pooja.find(poojaFilter).sort({ daily: -1, "schedules.date": 1, createdAt: -1 }).limit(5)
      ),
      Festival.find(festivalFilter)
        .sort({ date: 1 })
        .limit(5)
        .populate("createdBy", "email role"),
      Donation.find({ status: "APPROVED", isVisible: true })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("createdBy", "email role"),
      productService.getFeaturedProducts({ limit: 10 }),
      req.user?.userId
        ? getPersonalizedHomeData(req.user.userId, timezone)
        : Promise.resolve({
            completedPujasCount: 0,
            completedRitualsCount: 0,
            streak: null,
          }),
    ]);

    return sendSuccess(
      res,
      {
        todayDate: panchang.todayDate,
        todayTithi: panchang.todayTithi,
        todayDateAndTithi: panchang.todayDateAndTithi,
        timezone,
        todayDateKey,
        completedPujasCount: personalized.completedPujasCount,
        completedRitualsCount: personalized.completedRitualsCount,
        streak: personalized.streak,
        dailySloka,
        dailyPoojas,
        poojas,
        festivals,
        donations,
        featuredProducts,
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
