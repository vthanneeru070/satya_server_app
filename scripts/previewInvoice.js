/**
 * Preview the invoice PDF UI locally without placing an order.
 *
 * Usage:
 *   npm run preview:invoice
 *   node scripts/previewInvoice.js
 *   node scripts/previewInvoice.js --out=/tmp/sathya-invoice.pdf
 *
 * Opens (or writes) a sample PDF using the current invoice template
 * (watermark, model spacing, totals, etc.). No MongoDB / S3 required.
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { _internal } = require("../src/services/invoiceService");

const parseOutPath = () => {
  const arg = process.argv.find((a) => a.startsWith("--out="));
  if (arg) return path.resolve(arg.slice("--out=".length));
  return path.join(__dirname, "..", "tmp", "invoice-preview.pdf");
};

async function main() {
  const outPath = parseOutPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const order = {
    orderNumber: "ORD-PREVIEW-10001",
    createdAt: new Date(),
    paymentStatus: "PAID",
    paymentMethod: "PAYFAST",
    vatNumber: "4123456789",
    subtotal: 650,
    taxAmount: 97.5,
    vatPercent: 15,
    deliveryCharge: 75,
    totalAmount: 822.5,
    currency: "ZAR",
    shippingAddress: {
      fullName: "Preview Customer",
      addressLine1: "12 Long Street",
      addressLine2: "Apartment 4B",
      city: "Cape Town",
      postalCode: "8001",
      state: "Western Cape",
      country: "South Africa",
    },
    billingAddress: {
      fullName: "Preview Customer",
      addressLine1: "12 Long Street",
      city: "Cape Town",
      postalCode: "8001",
      state: "Western Cape",
      country: "South Africa",
    },
    items: [
      {
        product: "preview-product-1",
        title: "Sathyas Book",
        quantity: 2,
        price: 150,
        lineTotal: 300,
      },
      {
        product: "preview-product-2",
        title: "Ayurvedic Oil Kit",
        quantity: 1,
        price: 150,
        lineTotal: 150,
      },
      {
        product: "preview-product-3",
        title: "Ganesha Puja Kit",
        quantity: 1,
        price: 200,
        lineTotal: 200,
      },
    ],
  };

  const productDetails = new Map([
    [
      "preview-product-1",
      {
        model: _internal.toProductCategoryLabel("book"),
        title: "Sathyas Book",
        imageUrl: "",
        price: 150,
      },
    ],
    [
      "preview-product-2",
      {
        model: _internal.toProductCategoryLabel("ayurvedic"),
        title: "Ayurvedic Oil Kit",
        imageUrl: "",
        price: 150,
      },
    ],
    [
      "preview-product-3",
      {
        model: _internal.toProductCategoryLabel("pujakit"),
        title: "Ganesha Puja Kit",
        imageUrl: "",
        price: 200,
      },
    ],
  ]);

  // Resolve logo the same way generateInvoice does (local assets / env).
  const logoPath =
    process.env.INVOICE_LOGO_PATH ||
    path.join(__dirname, "..", "assets", "sathya-logo.png");
  let logoBuffer = null;
  if (fs.existsSync(logoPath)) {
    logoBuffer = fs.readFileSync(logoPath);
    if (logoBuffer.length > 500 * 1024) {
      console.warn(
        `[previewInvoice] logo too large (${logoBuffer.length} bytes); previewing without watermark`
      );
      logoBuffer = null;
    }
  }

  const buffer = await _internal.buildInvoicePdf({
    order,
    productDetails,
    appName: process.env.APP_NAME || "Sathya",
    storeLabel: process.env.INVOICE_STORE_LABEL || "Online",
    phone: process.env.INVOICE_CONTACT_PHONE || "+27 00 000 0000",
    email:
      process.env.INVOICE_CONTACT_EMAIL ||
      process.env.BREVO_SENDER_EMAIL ||
      "support@sathya.co.za",
    invoiceNumber: "INV-PREVIEW-10001",
    customerEmail: "preview.customer@example.com",
    logoBuffer,
  });

  fs.writeFileSync(outPath, buffer);
  console.log(`[previewInvoice] Wrote ${buffer.length} bytes → ${outPath}`);

  // Best-effort open on macOS / Linux / Windows.
  const { spawn } = require("child_process");
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(opener, [outPath], { shell: process.platform === "win32", detached: true, stdio: "ignore" }).unref();
    console.log("[previewInvoice] Opening PDF…");
  } catch {
    console.log("[previewInvoice] Open the file manually to review the UI.");
  }
}

main().catch((err) => {
  console.error("[previewInvoice] Failed:", err?.message || err);
  process.exit(1);
});
