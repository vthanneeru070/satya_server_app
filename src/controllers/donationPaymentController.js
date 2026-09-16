const { sendSuccess } = require("../utils/response");
const paymentService = require("../services/paymentService");
const DonationContribution = require("../models/DonationContribution");
const Payment = require("../models/Payment");
const User = require("../models/User");

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const initiateDonation = async (req, res, next) => {
  try {
    const data = await paymentService.initializeDonationPayment({
      userId: req.user.userId,
      amount: req.body.amount,
      currency: req.body.currency,
      note: req.body.note,
      callbackUrl: req.body?.callbackUrl,
    });
    return sendSuccess(res, data, "PayFast donation initialized", 201);
  } catch (error) {
    return next(error);
  }
};

/**
 * Search across contribution id/number, PayFast payment id, merchant
 * reference, and contributor name/email.
 */
const buildContributionSearchFilter = async (searchTerm) => {
  const trimmed = String(searchTerm || "").trim();
  if (!trimmed) return null;

  const safe = escapeRegex(trimmed);
  const orClauses = [
    { contributionNumber: { $regex: safe, $options: "i" } },
    { paystackReference: { $regex: safe, $options: "i" } },
    { transactionId: { $regex: safe, $options: "i" } },
  ];

  if (/^[a-f0-9]{24}$/i.test(trimmed)) {
    orClauses.push({ _id: trimmed });
  }

  const [matchingUsers, matchingPayments] = await Promise.all([
    User.find({
      $or: [
        { fullName: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ],
    })
      .select("_id")
      .lean(),
    Payment.find({
      paymentFor: "DONATION",
      isDeleted: { $ne: true },
      donationContribution: { $ne: null },
      $or: [
        { reference: { $regex: safe, $options: "i" } },
        { transactionId: { $regex: safe, $options: "i" } },
        { paymentId: { $regex: safe, $options: "i" } },
      ],
    })
      .select("donationContribution")
      .lean(),
  ]);

  if (matchingUsers.length) {
    orClauses.push({ user: { $in: matchingUsers.map((u) => u._id) } });
  }

  const contributionIds = matchingPayments
    .map((p) => p.donationContribution)
    .filter(Boolean);
  if (contributionIds.length) {
    orClauses.push({ _id: { $in: contributionIds } });
  }

  return { $or: orClauses };
};

const buildListFilters = async (query, { userId } = {}) => {
  const filter = { isDeleted: { $ne: true } };
  if (userId) filter.user = userId;
  if (query?.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query?.donation) filter.donation = query.donation;
  if (query?.user && !userId) filter.user = query.user;

  const searchFilter = await buildContributionSearchFilter(query?.search);
  if (searchFilter) {
    Object.assign(filter, searchFilter);
  }

  return filter;
};

/** Expose PayFast pf_payment_id alongside legacy field names for admin/clients. */
const serializeDonationContribution = (doc) => {
  const row = doc?.toObject ? doc.toObject() : { ...doc };
  const paymentReference = row.paystackReference || null;
  const payfastPaymentId = row.transactionId
    ? String(row.transactionId)
    : null;
  return {
    ...row,
    paymentReference,
    reference: paymentReference,
    payfastPaymentId,
  };
};

const fetchPaginated = async (filter, { page = 1, limit = 10 }) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const [rawItems, total] = await Promise.all([
    DonationContribution.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("donation", "title image status isVisible")
      .populate("user", "fullName email"),
    DonationContribution.countDocuments(filter),
  ]);

  const items = rawItems.map((doc) => serializeDonationContribution(doc));

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
    const filter = await buildListFilters(req.query, { userId: req.user.userId });
    const data = await fetchPaginated(filter, req.query);
    return sendSuccess(res, data, "My donation contributions fetched");
  } catch (error) {
    return next(error);
  }
};

const adminListDonationContributions = async (req, res, next) => {
  try {
    const filter = await buildListFilters(req.query);
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
