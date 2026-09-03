const mongoose = require("mongoose");

/**
 * Count / page user sessions whose related content document still exists.
 * Soft-deleted content is excluded when `refNotDeleted` is true.
 */
const buildExistingContentPipeline = ({
  userId,
  status,
  refField,
  collectionName,
  refNotDeleted = false,
}) => {
  const match = {
    user: new mongoose.Types.ObjectId(String(userId)),
    isDeleted: { $ne: true },
  };
  if (status) match.status = status;

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: collectionName,
        localField: refField,
        foreignField: "_id",
        as: "_content",
      },
    },
    { $unwind: "$_content" },
  ];

  if (refNotDeleted) {
    pipeline.push({ $match: { "_content.isDeleted": { $ne: true } } });
  }

  return pipeline;
};

const countSessionsWithExistingContent = async ({
  SessionModel,
  userId,
  status,
  refField,
  collectionName,
  refNotDeleted = false,
}) => {
  const pipeline = [
    ...buildExistingContentPipeline({
      userId,
      status,
      refField,
      collectionName,
      refNotDeleted,
    }),
    { $count: "total" },
  ];
  const rows = await SessionModel.aggregate(pipeline);
  return rows[0]?.total || 0;
};

/**
 * Returns lean session docs with the related content embedded on `refField`.
 * Caller should populate nested refs (e.g. deity) if needed.
 */
const fetchSessionsWithExistingContent = async ({
  SessionModel,
  userId,
  status,
  page = 1,
  limit = 20,
  refField,
  collectionName,
  refNotDeleted = false,
  sort = { updatedAt: -1 },
}) => {
  const skip = (Math.max(1, page) - 1) * limit;
  const base = buildExistingContentPipeline({
    userId,
    status,
    refField,
    collectionName,
    refNotDeleted,
  });

  const [countResult, docs] = await Promise.all([
    SessionModel.aggregate([...base, { $count: "total" }]),
    SessionModel.aggregate([
      ...base,
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
      {
        $addFields: {
          [refField]: "$_content",
        },
      },
      { $project: { _content: 0 } },
    ]),
  ]);

  return {
    docs,
    total: countResult[0]?.total || 0,
    page: Math.max(1, page),
    limit,
  };
};

const hasPopulatedContent = (session, refField) => {
  const ref = session?.[refField];
  if (!ref || typeof ref !== "object") return false;
  if (ref.isDeleted === true) return false;
  return Boolean(ref._id || ref.id || ref.title);
};

module.exports = {
  countSessionsWithExistingContent,
  fetchSessionsWithExistingContent,
  hasPopulatedContent,
};
