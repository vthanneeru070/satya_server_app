const axios = require("axios");
const PDFDocument = require("pdfkit");
const Counter = require("../models/Counter");
const Product = require("../models/Product");
const User = require("../models/User");
const { uploadFile } = require("./s3Service");

const INVOICE_PREFIX = process.env.INVOICE_NUMBER_PREFIX || "INV";
const INVOICE_SUPPORT_EMAIL =
  process.env.INVOICE_SUPPORT_EMAIL || "support@sathya.co.za";

const PAGE_WIDTH = 595.28;
const MARGIN = 36;
const PAGE_LEFT = MARGIN;
const PAGE_RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;
const PAGE_BOTTOM = 780;

const HEADER_BG = "#2c3e50";
const BORDER_COLOR = "#cccccc";
const WHITE = "#ffffff";

const PRODUCT_COLS = {
  product: { label: "Product", width: 210 },
  model: { label: "Model", width: 80 },
  quantity: { label: "Quantity", width: 55 },
  price: { label: "Price", width: 85 },
  total: { label: "Total", width: CONTENT_WIDTH - 210 - 80 - 55 - 85 },
};

const COL_X = (() => {
  let x = PAGE_LEFT;
  const positions = {};
  for (const [key, col] of Object.entries(PRODUCT_COLS)) {
    positions[key] = x;
    x += col.width;
  }
  return positions;
})();

/**
 * Next sequential invoice number. Uses the shared `Counter` collection with a
 * dedicated `_id: "invoiceSequence"` so it never collides with order / donation /
 * request counters. First call returns `<PREFIX>-10001`.
 */
const nextInvoiceNumber = async () => {
  const doc = await Counter.findOneAndUpdate(
    { _id: "invoiceSequence" },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", 10000] }, 1] } } }],
    { new: true, upsert: true, updatePipeline: true }
  );
  return `${INVOICE_PREFIX}-${doc.seq}`;
};

const formatZar = (amount) => `R${Number(amount || 0).toFixed(2)}`;

const formatInvoiceDate = (date) => {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const mapPaymentMethod = (method) => {
  switch (method) {
    case "PAYFAST":
    case "PAYSTACK":
      return "Pay now using";
    case "COD":
      return "Cash On Delivery";
    case "EFT":
      return "EFT";
    default:
      return method || "—";
  }
};

const mapPaymentStatus = (status) => {
  switch (status) {
    case "PAID":
      return "Paid";
    case "PENDING":
      return "Pending";
    case "FAILED":
      return "Failed";
    case "REFUND_INITIATED":
      return "Refund Initiated";
    case "REFUNDED":
      return "Refunded";
    case "REFUND_FAILED":
      return "Refund Failed";
    default:
      return status || "—";
  }
};

const formatOrderId = (orderNumber) => {
  if (!orderNumber) return "—";
  const match = String(orderNumber).match(/(\d+)$/);
  return match ? match[1] : String(orderNumber);
};

const formatInvoiceAddressLines = (addr) => {
  if (!addr) return ["—"];
  return [
    addr.fullName,
    addr.addressLine2,
    addr.addressLine1,
    [addr.city, addr.postalCode].filter(Boolean).join(" "),
    addr.state,
    addr.country,
  ].filter((piece) => piece && String(piece).trim().length > 0);
};

const toProductModel = (slug) => {
  if (!slug) return "—";
  const compact = String(slug).replace(/-/g, "").toUpperCase();
  return compact.length > 15 ? compact.slice(0, 15) : compact;
};

const effectivePriceOf = (product) =>
  product?.salePrice && product.salePrice > 0 ? product.salePrice : product?.price || 0;

const toPlainLine = (line) => {
  if (!line) return {};
  if (typeof line.toObject === "function") return line.toObject();
  if (typeof line.toJSON === "function") return line.toJSON();
  return line;
};

const loadProductDetails = async (items = []) => {
  const ids = items.map((line) => toPlainLine(line).product).filter(Boolean);
  if (!ids.length) return new Map();

  const products = await Product.find({ _id: { $in: ids } })
    .select("slug title imageUrl price salePrice")
    .lean();

  return new Map(
    products.map((product) => [
      String(product._id),
      {
        model: toProductModel(product.slug),
        title: product.title || "",
        imageUrl: product.imageUrl || "",
        price: effectivePriceOf(product),
      },
    ])
  );
};

const loadImageBuffer = async (url) => {
  if (!url) return null;
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 8000,
    });
    return Buffer.from(response.data);
  } catch {
    return null;
  }
};

const strokeRect = (doc, x, y, w, h) => {
  doc
    .save()
    .rect(x, y, w, h)
    .strokeColor(BORDER_COLOR)
    .lineWidth(0.5)
    .stroke()
    .restore();
};

const fillRect = (doc, x, y, w, h, color) => {
  doc.save().rect(x, y, w, h).fill(color).restore();
};

const drawCompanyHeader = (doc, { appName, storeLabel, phone, email }) => {
  const headerTop = MARGIN;
  doc.font("Helvetica-Bold").fontSize(18);
  doc.text(appName, PAGE_LEFT, headerTop, {
    width: CONTENT_WIDTH,
    align: "right",
  });

  doc.font("Helvetica").fontSize(10);
  let y = doc.y;
  doc.text(storeLabel, PAGE_LEFT, y, { width: CONTENT_WIDTH, align: "right" });
  if (phone) {
    y = doc.y;
    doc.text(phone, PAGE_LEFT, y, { width: CONTENT_WIDTH, align: "right" });
  }
  if (email) {
    y = doc.y;
    doc.text(email, PAGE_LEFT, y, { width: CONTENT_WIDTH, align: "right" });
  }

  doc.y = doc.y + 18;
};

const drawMetaRow = (doc, leftLabel, leftValue, rightLabel, rightValue) => {
  const y = doc.y;
  const half = CONTENT_WIDTH / 2;
  doc.font("Helvetica-Bold").fontSize(9).text(leftLabel, PAGE_LEFT, y, {
    continued: true,
    width: half,
    align: "left",
  });
  doc.font("Helvetica").text(` ${leftValue}`, { continued: false });

  if (rightLabel) {
    doc.font("Helvetica-Bold").text(rightLabel, PAGE_LEFT + half, y, {
      continued: true,
      width: half,
      align: "left",
    });
    doc.font("Helvetica").text(` ${rightValue}`, { continued: false });
  }

  doc.y = y + 14;
};

const resolveCustomerEmail = async (order) => {
  if (!order?.user) return "";
  if (typeof order.user === "object" && order.user.email) {
    return String(order.user.email).trim();
  }
  const user = await User.findById(order.user).select("email").lean();
  return user?.email ? String(user.email).trim() : "";
};

const drawOrderMeta = (doc, order, { invoiceNumber = "", customerEmail = "" } = {}) => {
  drawMetaRow(
    doc,
    "Order Date:",
    formatInvoiceDate(order.createdAt),
    "Invoice Number:",
    invoiceNumber || "—"
  );
  drawMetaRow(
    doc,
    "Customer Email:",
    customerEmail || "—",
    "Payment Status:",
    mapPaymentStatus(order.paymentStatus)
  );
  drawMetaRow(
    doc,
    "Order ID:",
    formatOrderId(order.orderNumber),
    "Payment Method:",
    mapPaymentMethod(order.paymentMethod)
  );
  doc.y += 8;
};

const drawAddressTable = (doc, paymentLines, shippingLines) => {
  const colWidth = CONTENT_WIDTH / 2;
  const headerHeight = 22;
  const bodyHeight = Math.max(paymentLines.length, shippingLines.length) * 13 + 16;
  const tableTop = doc.y;

  fillRect(doc, PAGE_LEFT, tableTop, colWidth, headerHeight, HEADER_BG);
  fillRect(doc, PAGE_LEFT + colWidth, tableTop, colWidth, headerHeight, HEADER_BG);

  doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE);
  doc.text("Payment Address", PAGE_LEFT, tableTop + 6, {
    width: colWidth,
    align: "center",
  });
  doc.text("Shipping Address", PAGE_LEFT + colWidth, tableTop + 6, {
    width: colWidth,
    align: "center",
  });

  strokeRect(doc, PAGE_LEFT, tableTop, colWidth, headerHeight + bodyHeight);
  strokeRect(doc, PAGE_LEFT + colWidth, tableTop, colWidth, headerHeight + bodyHeight);
  doc
    .moveTo(PAGE_LEFT, tableTop + headerHeight)
    .lineTo(PAGE_RIGHT, tableTop + headerHeight)
    .strokeColor(BORDER_COLOR)
    .lineWidth(0.5)
    .stroke();

  doc.fillColor("#000000").font("Helvetica").fontSize(9);
  const bodyTop = tableTop + headerHeight + 8;
  paymentLines.forEach((line, index) => {
    doc.text(line, PAGE_LEFT + 8, bodyTop + index * 13, {
      width: colWidth - 16,
      lineBreak: false,
    });
  });
  shippingLines.forEach((line, index) => {
    doc.text(line, PAGE_LEFT + colWidth + 8, bodyTop + index * 13, {
      width: colWidth - 16,
      lineBreak: false,
    });
  });

  doc.y = tableTop + headerHeight + bodyHeight + 14;
};

const drawProductTableHeader = (doc) => {
  const headerHeight = 22;
  const tableTop = doc.y;

  fillRect(doc, PAGE_LEFT, tableTop, CONTENT_WIDTH, headerHeight, HEADER_BG);

  doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE);
  doc.text(PRODUCT_COLS.product.label, COL_X.product + 8, tableTop + 6, {
    width: PRODUCT_COLS.product.width - 16,
    align: "left",
  });
  doc.text(PRODUCT_COLS.model.label, COL_X.model, tableTop + 6, {
    width: PRODUCT_COLS.model.width,
    align: "center",
  });
  doc.text(PRODUCT_COLS.quantity.label, COL_X.quantity, tableTop + 6, {
    width: PRODUCT_COLS.quantity.width,
    align: "center",
  });
  doc.text(PRODUCT_COLS.price.label, COL_X.price, tableTop + 6, {
    width: PRODUCT_COLS.price.width,
    align: "center",
  });
  doc.text(PRODUCT_COLS.total.label, COL_X.total, tableTop + 6, {
    width: PRODUCT_COLS.total.width,
    align: "center",
  });

  strokeRect(doc, PAGE_LEFT, tableTop, CONTENT_WIDTH, headerHeight);
  drawProductColumnDividers(doc, tableTop, headerHeight);
  doc.fillColor("#000000");
  doc.y = tableTop + headerHeight;
  return tableTop;
};

const measureProductCellHeight = (doc, line, imageBuffer) => {
  const imageSize = 42;
  const textX = COL_X.product + (imageBuffer ? imageSize + 14 : 8);
  const textWidth = PRODUCT_COLS.product.width - (imageBuffer ? imageSize + 22 : 16);
  doc.font("Helvetica-Bold").fontSize(9);
  const textHeight = doc.heightOfString(String(line.title || "—"), {
    width: textWidth,
  });
  return Math.max(imageBuffer ? imageSize + 8 : 0, textHeight + 16, 50);
};

const drawProductColumnDividers = (doc, top, height) => {
  let x = PAGE_LEFT;
  const keys = Object.keys(PRODUCT_COLS);
  for (let i = 1; i < keys.length; i += 1) {
    x += PRODUCT_COLS[keys[i - 1]].width;
    doc
      .moveTo(x, top)
      .lineTo(x, top + height)
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.5)
      .stroke();
  }
};

const drawProductRow = (doc, line, imageBuffer) => {
  const rowTop = doc.y;
  const rowHeight = measureProductCellHeight(doc, line, imageBuffer);
  const imageSize = 42;
  const padding = 8;

  strokeRect(doc, PAGE_LEFT, rowTop, CONTENT_WIDTH, rowHeight);
  drawProductColumnDividers(doc, rowTop, rowHeight);

  const cellTextY = rowTop + rowHeight / 2 - 4;
  if (imageBuffer) {
    try {
      doc.image(imageBuffer, COL_X.product + padding, rowTop + padding, {
        fit: [imageSize, imageSize],
        align: "center",
        valign: "center",
      });
    } catch {
      // Skip broken image data and render text-only row.
    }
  }

  const textX = COL_X.product + (imageBuffer ? imageSize + 14 : padding);
  const textWidth = PRODUCT_COLS.product.width - (imageBuffer ? imageSize + 22 : 16);
  const textY = imageBuffer ? rowTop + padding : cellTextY;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
  doc.text(String(line.title || "—"), textX, textY, {
    width: textWidth,
    lineBreak: true,
  });

  doc.font("Helvetica").fontSize(9);
  doc.text(String(line.model || "—"), COL_X.model, cellTextY, {
    width: PRODUCT_COLS.model.width,
    align: "center",
    lineBreak: false,
  });
  doc.text(String(line.quantity), COL_X.quantity, cellTextY, {
    width: PRODUCT_COLS.quantity.width,
    align: "center",
    lineBreak: false,
  });
  doc.text(formatZar(line.price), COL_X.price, cellTextY, {
    width: PRODUCT_COLS.price.width,
    align: "center",
    lineBreak: false,
  });
  doc.text(formatZar(line.lineTotal), COL_X.total, cellTextY, {
    width: PRODUCT_COLS.total.width,
    align: "center",
    lineBreak: false,
  });

  doc.y = rowTop + rowHeight;
};

const drawTotals = (doc, { subtotal, deliveryCharge = 0, total }) => {
  let y = doc.y + 12;
  const labelX = COL_X.price;
  const valueX = COL_X.total;
  const labelWidth = PRODUCT_COLS.price.width;
  const valueWidth = PRODUCT_COLS.total.width;

  const drawRow = (label, value, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#000000");
    doc.text(label, labelX, y, { width: labelWidth, align: "right", lineBreak: false });
    doc.text(value, valueX, y, { width: valueWidth, align: "right", lineBreak: false });
    y += 14;
  };

  drawRow("Sub-Total", formatZar(subtotal));
  if (Number(deliveryCharge) > 0) {
    drawRow("Delivery Charge", formatZar(deliveryCharge));
  }
  drawRow("Total", formatZar(total), true);
  doc.y = y;
};

const drawInvoiceFooter = (doc) => {
  doc.y += 24;
  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  doc.text(
    `For any questions regarding this order, please contact us at ${INVOICE_SUPPORT_EMAIL}`,
    PAGE_LEFT,
    doc.y,
    { width: CONTENT_WIDTH, align: "center" }
  );
};

const enrichOrderItems = (orderItems, productDetails) =>
  (orderItems || []).map((line) => {
    const raw = toPlainLine(line);
    const details = productDetails.get(String(raw.product)) || {};
    const quantity = Math.max(1, Number(raw.quantity) || 0);
    const price =
      Number(raw.price) > 0 ? Number(raw.price) : Number(details.price) || 0;
    const lineTotal =
      Number(raw.lineTotal) > 0 ? Number(raw.lineTotal) : price * quantity;

    return {
      ...raw,
      title: raw.title || details.title || "—",
      model: details.model || "—",
      imageUrl: raw.imageUrl || details.imageUrl || "",
      quantity,
      price,
      lineTotal,
    };
  });

const resolveInvoiceTotals = (order, itemsSubtotal) => {
  const linesSubtotal = Math.round(Number(itemsSubtotal) * 100) / 100;
  const storedSubtotal = Number(order?.subtotal);
  const storedDelivery = Number(order?.deliveryCharge);
  const storedTotal = Number(order?.totalAmount);

  const subtotal =
    Number.isFinite(storedSubtotal) && storedSubtotal > 0
      ? Math.round(storedSubtotal * 100) / 100
      : linesSubtotal;

  let deliveryCharge = 0;
  if (Number.isFinite(storedDelivery) && storedDelivery >= 0) {
    deliveryCharge = Math.round(storedDelivery * 100) / 100;
  } else if (Number.isFinite(storedTotal) && storedTotal > subtotal) {
    deliveryCharge = Math.round((storedTotal - subtotal) * 100) / 100;
  }

  const total =
    Number.isFinite(storedTotal) && storedTotal > 0
      ? Math.round(storedTotal * 100) / 100
      : Math.round((subtotal + deliveryCharge) * 100) / 100;

  return { subtotal, deliveryCharge, total };
};

/**
 * Build an OpenCart-style order invoice PDF buffer.
 */
const buildInvoicePdf = async ({
  order,
  productDetails,
  appName,
  storeLabel,
  phone,
  email,
  invoiceNumber,
  customerEmail,
}) => {
  const paymentAddress = formatInvoiceAddressLines(order.shippingAddress);
  const shippingAddress = formatInvoiceAddressLines(
    order.billingAddress || order.shippingAddress
  );
  const items = enrichOrderItems(order.items, productDetails);

  const imageBuffers = await Promise.all(
    items.map((line) => loadImageBuffer(line.imageUrl))
  );

  const itemsSubtotal = items.reduce(
    (sum, line) => sum + Number(line.lineTotal || 0),
    0
  );
  const { subtotal, deliveryCharge, total } = resolveInvoiceTotals(order, itemsSubtotal);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawCompanyHeader(doc, { appName, storeLabel, phone, email });
    drawOrderMeta(doc, order, { invoiceNumber, customerEmail });
    drawAddressTable(doc, paymentAddress, shippingAddress);
    drawProductTableHeader(doc);

    for (let index = 0; index < items.length; index += 1) {
      const line = items[index];
      const rowHeight = measureProductCellHeight(doc, line, imageBuffers[index]);
      if (doc.y + rowHeight > PAGE_BOTTOM) {
        doc.addPage();
        drawProductTableHeader(doc);
      }
      drawProductRow(doc, line, imageBuffers[index]);
    }

    if (doc.y + 80 > PAGE_BOTTOM) {
      doc.addPage();
    }

    drawTotals(doc, { subtotal, deliveryCharge, total });
    drawInvoiceFooter(doc);

    doc.end();
  });
};

/**
 * Generate a PDF invoice for the given order, upload it to S3 under
 * `invoices/order_<orderNumber>.pdf`, and return both the invoice number and the
 * public URL. Caller is responsible for persisting these onto the Order document.
 */
const generateInvoice = async (order) => {
  if (!order) return { number: "", url: "" };

  try {
    const invoiceNumber = await nextInvoiceNumber();
    const appName = process.env.APP_NAME || "Sathya";
    const storeLabel = process.env.INVOICE_STORE_LABEL || "Online";
    const phone = process.env.INVOICE_CONTACT_PHONE || "";
    const email =
      process.env.INVOICE_CONTACT_EMAIL ||
      process.env.BREVO_SENDER_EMAIL ||
      "";
    const productDetails = await loadProductDetails(order.items);
    const customerEmail = await resolveCustomerEmail(order);
    const buffer = await buildInvoicePdf({
      order,
      productDetails,
      appName,
      storeLabel,
      phone,
      email,
      invoiceNumber,
      customerEmail,
    });

    const safeOrderId = String(order.orderNumber).replace(/[^a-zA-Z0-9-]/g, "_");
    const fakeFile = {
      buffer,
      originalname: `order_${safeOrderId}.pdf`,
      mimetype: "application/pdf",
    };

    const url = await uploadFile(fakeFile, "invoices");
    return { number: invoiceNumber, url };
  } catch (err) {
    console.error(
      "[invoiceService] generateInvoice failed:",
      err?.message || err
    );
    return { number: "", url: "" };
  }
};

module.exports = {
  generateInvoice,
  nextInvoiceNumber,
  _internal: { buildInvoicePdf, formatZar, formatInvoiceDate, resolveInvoiceTotals },
};
