const crypto = require("crypto");

const generatePickupPin = () => String(crypto.randomInt(100000, 1000000));

const generateQrToken = (orderId, pin) => {
  const secret =
    process.env.PICKUP_QR_SECRET ||
    process.env.JWT_SECRET ||
    "satya-pickup-dev-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(`${String(orderId)}:${pin}`)
    .digest("hex")
    .slice(0, 32);
};

/**
 * Issue pickup PIN + QR token on the order document.
 * Mutates and saves the order.
 */
const issuePickupCredentials = async (order) => {
  if (order.fulfillmentMethod !== "PICKUP") return order;

  const existing = String(order.pickupCollection?.code || "").trim();
  if (existing) {
    if (!order.pickupCredentials?.qrToken) {
      order.pickupCredentials = {
        pin: existing,
        qrToken: generateQrToken(order._id, existing),
        issuedAt: order.pickupCollection.generatedAt || new Date(),
        collectedAt: null,
        collectedBy: null,
      };
      await order.save();
    }
    return order;
  }

  const pin = generatePickupPin();
  const issuedAt = new Date();
  order.pickupCollection = { code: pin, generatedAt: issuedAt };
  order.pickupCredentials = {
    pin,
    qrToken: generateQrToken(order._id, pin),
    issuedAt,
    collectedAt: null,
    collectedBy: null,
  };
  await order.save();
  return order;
};

const pinMatchesOrder = (order, providedPin) => {
  const expected =
    String(order.pickupCredentials?.pin || order.pickupCollection?.code || "").trim();
  const provided = String(providedPin || "").trim();
  return Boolean(expected) && expected === provided;
};

module.exports = {
  generatePickupPin,
  generateQrToken,
  issuePickupCredentials,
  pinMatchesOrder,
};
