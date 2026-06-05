const PDFDocument = require("pdfkit");
const Counter = require("../models/Counter");
const Product = require("../models/Product");
const { uploadFile } = require("./s3Service");

const INVOICE_PREFIX = process.env.INVOICE_NUMBER_PREFIX || "INV";

const PAGE_LEFT = 40;
const PAGE_RIGHT = 555;
const PAGE_BOTTOM = 760;

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

const mapOrderStatus = (status) => {
  switch (status) {
    case "FULFILLED":
    case "DELIVERED":
      return "Complete";
    case "CANCELLED":
      return "Cancelled";
    case "PLACED":
      return "Pending";
    case "PROCESSING":
      return "Processing";
    case "SHIPPED":
      return "Shipped";
    case "OUT_FOR_DELIVERY":
      return "Out For Delivery";
    default:
      return status || "—";
  }
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

const loadProductModels = async (items = []) => {
  const ids = items.map((line) => line.product).filter(Boolean);
  if (!ids.length) return new Map();

  const products = await Product.find({ _id: { $in: ids } })
    .select("slug")
    .lean();
  return new Map(
    products.map((product) => [
      String(product._id),
      toProductModel(product.slug),
    ])
  );
};

const TABLE_COLUMNS = [
  { key: "product", label: "Product", x: PAGE_LEFT, width: 175, align: "left" },
  { key: "model", label: "Model", x: 215, width: 65, align: "left" },
  { key: "quantity", label: "Quantity", x: 280, width: 55, align: "center" },
  { key: "price", label: "Price", x: 335, width: 75, align: "right" },
  { key: "total", label: "Total", x: 410, width: 75, align: "right" },
];

const drawTableHeader = (doc) => {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9);
  TABLE_COLUMNS.forEach((col) => {
    doc.text(col.label, col.x, y, { width: col.width, align: col.align });
  });
  doc
    .moveTo(PAGE_LEFT, y + 13)
    .lineTo(PAGE_RIGHT, y + 13)
    .strokeColor("#000000")
    .lineWidth(0.5)
    .stroke();
  doc.y = y + 18;
  doc.font("Helvetica").fontSize(9);
};

const drawAddressColumns = (doc, paymentLines, shippingLines) => {
  const headerY = doc.y;
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Payment Address", PAGE_LEFT, headerY);
  doc.text("Shipping Address", 300, headerY);

  const bodyY = headerY + 14;
  doc.font("Helvetica").fontSize(9);

  let leftY = bodyY;
  paymentLines.forEach((line) => {
    doc.text(line, PAGE_LEFT, leftY, { width: 240, lineBreak: false });
    leftY += 12;
  });

  let rightY = bodyY;
  shippingLines.forEach((line) => {
    doc.text(line, 300, rightY, { width: 240, lineBreak: false });
    rightY += 12;
  });

  doc.y = Math.max(leftY, rightY) + 16;
};

const drawTotals = (doc, { subtotal, shippingLabel, shippingCost, total }) => {
  let y = doc.y + 8;
  const labelX = 335;
  const valueX = 410;
  const labelWidth = 75;
  const valueWidth = 75;

  const drawRow = (label, value, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    doc.text(label, labelX, y, { width: labelWidth, align: "right" });
    doc.text(value, valueX, y, { width: valueWidth, align: "right" });
    y += 14;
  };

  drawRow("Sub-Total", formatZar(subtotal));
  drawRow(shippingLabel, formatZar(shippingCost));
  drawRow("Total", formatZar(total), true);
  doc.y = y;
};

const measureRowHeight = (doc, line) => {
  const productHeight = doc.heightOfString(String(line.title || ""), {
    width: TABLE_COLUMNS[0].width,
  });
  const modelHeight = doc.heightOfString(
    String(line.model || "—"),
    { width: TABLE_COLUMNS[1].width }
  );
  return Math.max(productHeight, modelHeight, 12) + 6;
};

const drawProductRow = (doc, line) => {
  const rowTop = doc.y;
  const rowHeight = measureRowHeight(doc, line);

  doc.font("Helvetica").fontSize(9);
  doc.text(String(line.title || ""), TABLE_COLUMNS[0].x, rowTop, {
    width: TABLE_COLUMNS[0].width,
  });
  doc.text(String(line.model || "—"), TABLE_COLUMNS[1].x, rowTop, {
    width: TABLE_COLUMNS[1].width,
  });
  doc.text(String(line.quantity ?? ""), TABLE_COLUMNS[2].x, rowTop, {
    width: TABLE_COLUMNS[2].width,
    align: "center",
  });
  doc.text(formatZar(line.price), TABLE_COLUMNS[3].x, rowTop, {
    width: TABLE_COLUMNS[3].width,
    align: "right",
  });
  doc.text(formatZar(line.lineTotal), TABLE_COLUMNS[4].x, rowTop, {
    width: TABLE_COLUMNS[4].width,
    align: "right",
  });

  doc
    .moveTo(PAGE_LEFT, rowTop + rowHeight - 2)
    .lineTo(PAGE_RIGHT, rowTop + rowHeight - 2)
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .stroke();

  doc.y = rowTop + rowHeight;
};

/**
 * Build an OpenCart/TCPDF-style order invoice PDF buffer.
 */
const buildInvoicePdf = async ({
  order,
  productModels,
  appName,
  storeLabel,
  phone,
  email,
  shippingMethod,
}) => {
  const paymentAddress = formatInvoiceAddressLines(order.shippingAddress);
  const shippingAddress = formatInvoiceAddressLines(
    order.billingAddress || order.shippingAddress
  );
  const items = (order.items || []).map((line) => ({
    ...line,
    model: productModels.get(String(line.product)) || "—",
  }));

  const subtotal = items.reduce(
    (sum, line) => sum + Number(line.lineTotal || 0),
    0
  );
  const shippingCost = Math.max(0, Number(order.totalAmount || 0) - subtotal);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_LEFT });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text(appName, PAGE_LEFT, PAGE_LEFT);
    doc.font("Helvetica").fontSize(10);
    doc.text(storeLabel);
    if (phone) doc.text(phone);
    if (email) doc.text(email);

    doc.moveDown(0.8);
    doc.text(`Date: ${formatInvoiceDate(order.createdAt)}`);
    doc.text(`Order ID: ${order.orderNumber}`);
    doc.text(`Order Status: ${mapOrderStatus(order.orderStatus)}`);
    doc.text(`Payment Method: ${mapPaymentMethod(order.paymentMethod)}`);
    doc.text(`Shipping Method: ${shippingMethod}`);

    doc.moveDown(0.8);
    drawAddressColumns(doc, paymentAddress, shippingAddress);

    drawTableHeader(doc);
    for (const line of items) {
      const rowHeight = measureRowHeight(doc, line);
      if (doc.y + rowHeight > PAGE_BOTTOM) {
        doc.addPage();
        drawTableHeader(doc);
      }
      drawProductRow(doc, line);
    }

    if (doc.y + 60 > PAGE_BOTTOM) {
      doc.addPage();
    }

    drawTotals(doc, {
      subtotal,
      shippingLabel: shippingMethod,
      shippingCost,
      total: order.totalAmount,
    });

    doc.end();
  });
};

/**
 * Generate a PDF invoice for the given order, upload it to S3 under
 * `invoices/order_<orderNumber>.pdf`, and return both the invoice number and the
 * public URL. Caller is responsible for persisting these onto the Order document.
 *
 * The function never throws to the caller because invoice generation is best-
 * effort during the verify path — on failure it returns { number: "", url: "" }
 * and logs. A subsequent admin action can regenerate.
 */
const generateInvoice = async (order) => {
  if (!order) return { number: "", url: "" };

  try {
    const invoiceNumber = await nextInvoiceNumber();
    const appName = process.env.APP_NAME || "Satya";
    const storeLabel = process.env.INVOICE_STORE_LABEL || "Online";
    const phone = process.env.INVOICE_CONTACT_PHONE || "";
    const email =
      process.env.INVOICE_CONTACT_EMAIL ||
      process.env.BREVO_SENDER_EMAIL ||
      "";
    const shippingMethod =
      order.shippingMethod ||
      process.env.INVOICE_SHIPPING_METHOD_LABEL ||
      "Local Shipping";

    const productModels = await loadProductModels(order.items);
    const buffer = await buildInvoicePdf({
      order,
      productModels,
      appName,
      storeLabel,
      phone,
      email,
      shippingMethod,
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
  _internal: { buildInvoicePdf, formatZar, formatInvoiceDate },
};
