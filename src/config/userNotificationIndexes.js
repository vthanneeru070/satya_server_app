const UserNotification = require("../models/UserNotification");

const LEGACY_INDEX = "user_1_notification_1";

/**
 * The first inbox version used a unique { user, notification } index without
 * partialFilterExpression, so only one row per user could have notification:null.
 * Drop that index and re-sync partial indexes for order milestone rows.
 */
const ensureUserNotificationIndexes = async () => {
  const collection = UserNotification.collection;

  try {
    const indexes = await collection.indexes();
    const legacy = indexes.find((idx) => idx.name === LEGACY_INDEX);
    if (legacy && !legacy.partialFilterExpression) {
      await collection.dropIndex(LEGACY_INDEX);
      console.log(`[db] dropped legacy UserNotification index: ${LEGACY_INDEX}`);
    }
  } catch (err) {
    if (err?.code !== 27 && err?.codeName !== "IndexNotFound") {
      console.warn(
        "[db] could not drop legacy UserNotification index:",
        err?.message || err
      );
    }
  }

  try {
    const unset = await UserNotification.updateMany(
      {
        notification: null,
        sourceKey: { $exists: true, $nin: [null, ""] },
      },
      { $unset: { notification: "" } }
    );
    if (unset.modifiedCount > 0) {
      console.log(
        `[db] cleared notification:null on ${unset.modifiedCount} transactional inbox row(s)`
      );
    }
  } catch (err) {
    console.warn(
      "[db] UserNotification null cleanup failed:",
      err?.message || err
    );
  }

  await UserNotification.syncIndexes();
};

module.exports = { ensureUserNotificationIndexes };
