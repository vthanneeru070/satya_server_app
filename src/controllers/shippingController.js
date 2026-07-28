const { sendSuccess } = require("../utils/response");
const shippingQuoteService = require("../services/shippingQuoteService");
const shippingShipmentService = require("../services/shippingShipmentService");
const shippingPodService = require("../services/shippingPodService");
const orderService = require("../services/orderService");

const quoteShipping = async (req, res, next) => {
  try {
    const quote = await shippingQuoteService.quoteDoorToDoor({
      shippingAddress: req.body.shippingAddress,
      declaredValue: req.body.declaredValue,
    });
    return sendSuccess(res, { quote }, "Shipping rates fetched");
  } catch (error) {
    return next(error);
  }
};

const getPickupLocation = async (_req, res, next) => {
  try {
    const location = shippingQuoteService.getPickupLocation();
    return sendSuccess(res, { location }, "Pickup location fetched");
  } catch (error) {
    return next(error);
  }
};

/**
 * ShipLogic tracking webhook — payload shapes vary; we accept tracking event
 * objects and full shipment objects.
 */
const tcgWebhook = async (req, res, next) => {
  try {
    const payload = req.body || {};
    const status =
      payload.status ||
      payload.shipment_status ||
      (Array.isArray(payload.tracking_events) &&
        payload.tracking_events[0]?.status) ||
      null;

    const order = await shippingShipmentService.findOrderByShipmentPayload(payload);
    if (!order) {
      console.warn("[tcgWebhook] no matching order for payload", {
        shipment_id: payload.shipment_id || payload.id,
        status,
      });
      return sendSuccess(res, { matched: false }, "No matching order");
    }

    const result = shippingShipmentService.applyTrackingUpdate(order, {
      status,
      payload,
    });
    await order.save();

    if (
      result.podStatus &&
      shippingPodService.POD_STATUS_LABELS[result.podStatus] &&
      order.delivery?.podMethod
    ) {
      await shippingPodService.enrichPodAssets(order).catch((err) =>
        console.warn(
          `[tcgWebhook] POD asset fetch failed for ${order.orderNumber}:`,
          err?.message || err
        )
      );
      await order.save();
    }

    if (result.nextOrderStatus && result.nextOrderStatus !== order.orderStatus) {
      await orderService.updateStatus(
        order._id,
        {
          status: result.nextOrderStatus,
          note: `Courier status: ${status}`,
        },
        { actorUserId: null }
      );
    }

    if (result.alert) {
      console.warn(
        `[tcgWebhook] alert status "${status}" on order ${order.orderNumber}`
      );
    }

    return sendSuccess(
      res,
      {
        matched: true,
        orderId: order._id,
        deliveryStatus: status,
        podStatus: order.delivery?.pod?.status || null,
        orderStatus: result.nextOrderStatus || order.orderStatus,
      },
      "Webhook processed"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  quoteShipping,
  getPickupLocation,
  tcgWebhook,
};
