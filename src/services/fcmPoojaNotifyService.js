const { pushWithInbox } = require("./fcmOrderNotifyService");

/**
 * Notify user that a pooja session was completed.
 */
const notifyPoojaCompleted = async (
  userId,
  { poojaId, poojaTitle, sessionId }
) => {
  try {
    if (!userId || !poojaId || !sessionId) return;

    const title = "Puja completed";
    const body = poojaTitle
      ? `Congratulations! You completed "${poojaTitle}".`
      : "Your puja has been completed successfully.";

    const data = {
      type: "POOJA_COMPLETED",
      userId: String(userId),
      poojaId: String(poojaId),
      sessionId: String(sessionId),
    };

    await pushWithInbox(userId, {
      notification: { title, body },
      data,
      sourceKey: `pooja:${sessionId}:completed`,
      logTag: "notifyPoojaCompleted",
    });
  } catch (err) {
    console.warn("[fcm] notifyPoojaCompleted failed:", err?.message || err);
  }
};

module.exports = {
  notifyPoojaCompleted,
};
