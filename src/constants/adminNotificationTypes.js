/**
 * Admin panel / FCM `data.type` values for operational alerts.
 * All values are persisted on AdminNotification.type and sent in FCM data payloads.
 */
const ADMIN_NOTIFICATION_TYPES = Object.freeze({
  /** Paystack (or COD) order payment confirmed — admin should fulfil. */
  NEW_ORDER: "NEW_ORDER",
  /** User opened a refund request on an order. */
  REFUND_REQUEST: "REFUND_REQUEST",
  /** Donation contribution payment confirmed. */
  PAYMENT_SUCCESS: "PAYMENT_SUCCESS",
  /** User submitted a replacement request (optional). */
  REPLACEMENT_REQUEST: "REPLACEMENT_REQUEST",
});

module.exports = { ADMIN_NOTIFICATION_TYPES };
