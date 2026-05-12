const { sendSuccess } = require("../utils/response");
const paymentService = require("../services/paymentService");
const DonationContribution = require("../models/DonationContribution");

const initiateDonation = async (req, res, next) => {
  try {
    const data = await paymentService.initializeDonationPayment(req.params.id, {
      userId: req.user.userId,
      amount: req.body.amount,
      currency: req.body.currency,
      note: req.body.note,
      callbackUrl: req.body?.callbackUrl,
    });
    return sendSuccess(res, data, "Donation initialized", 201);
  } catch (error) {
    return next(error);
  }
};

const buildListFilters = (query, { userId } = {}) => {
  const filter = { isDeleted: { $ne: true } };
  if (userId) filter.user = userId;
  if (query?.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query?.donation) filter.donation = query.donation;
  if (query?.user && !userId) filter.user = query.user;
  return filter;
};

const fetchPaginated = async (filter, { page = 1, limit = 10 }) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    DonationContribution.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("donation", "title image status isVisible")
      .populate("user", "fullName email"),
    DonationContribution.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(Math.ceil(total / limitNum), 1),
    },
  };
};

const listMyDonationContributions = async (req, res, next) => {
  try {
    const filter = buildListFilters(req.query, { userId: req.user.userId });
    const data = await fetchPaginated(filter, req.query);
    return sendSuccess(res, data, "My donation contributions fetched");
  } catch (error) {
    return next(error);
  }
};

const adminListDonationContributions = async (req, res, next) => {
  try {
    const filter = buildListFilters(req.query);
    const data = await fetchPaginated(filter, req.query);
    return sendSuccess(res, data, "Donation contributions fetched");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  initiateDonation,
  listMyDonationContributions,
  adminListDonationContributions,
};
