/**
 * Backfill PayFast pf_payment_id on Payment, DonationContribution, and Order rows
 * that are PAID/SUCCESS but missing transactionId.
 *
 * Usage:
 *   node scripts/backfillPayfastTransactionIds.js
 *   node scripts/backfillPayfastTransactionIds.js --dry-run
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Payment = require("../src/models/Payment");
const DonationContribution = require("../src/models/DonationContribution");
const Order = require("../src/models/Order");
const {
  backfillPayfastTransactionId,
  extractPfPaymentIdFromStoredGatewayData,
} = require("../src/services/paymentService");

const dryRun = process.argv.includes("--dry-run");

const main = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is required");

  await mongoose.connect(uri);
  console.log(`[backfill] connected (dryRun=${dryRun})`);

  const payments = await Payment.find({
    gateway: "PAYFAST",
    status: "SUCCESS",
    isDeleted: { $ne: true },
    $or: [{ transactionId: null }, { transactionId: "" }],
  }).select("reference createdAt amount response donationContribution order transactionId");

  let updated = 0;
  let skipped = 0;

  for (const payment of payments) {
    const localPfId = extractPfPaymentIdFromStoredGatewayData(payment);
    if (dryRun) {
      console.log(
        `[dry-run] ${payment.reference} localPfId=${localPfId || "—"} createdAt=${payment.createdAt}`
      );
      continue;
    }

    const result = await backfillPayfastTransactionId(payment.reference);
    if (result.updated) {
      updated += 1;
      console.log(`[updated] ${payment.reference} → ${result.payfastPaymentId}`);
    } else {
      skipped += 1;
      console.log(`[skipped] ${payment.reference}: ${result.reason}`);
    }
  }

  const orphanContributions = await DonationContribution.find({
    paymentStatus: "PAID",
    isDeleted: { $ne: true },
    paystackReference: { $ne: null },
    $or: [{ transactionId: null }, { transactionId: "" }],
  }).select("paystackReference contributionNumber");

  for (const row of orphanContributions) {
    if (!row.paystackReference) continue;
    if (dryRun) {
      console.log(`[dry-run] contribution ${row.contributionNumber} ref=${row.paystackReference}`);
      continue;
    }
    const result = await backfillPayfastTransactionId(row.paystackReference);
    if (result.updated) {
      updated += 1;
      console.log(
        `[updated] contribution ${row.contributionNumber} → ${result.payfastPaymentId}`
      );
    }
  }

  const orphanOrders = await Order.find({
    paymentStatus: "PAID",
    isDeleted: { $ne: true },
    paystackReference: { $ne: null },
    $or: [{ transactionId: null }, { transactionId: "" }],
  }).select("paystackReference orderNumber");

  for (const row of orphanOrders) {
    if (!row.paystackReference) continue;
    if (dryRun) {
      console.log(`[dry-run] order ${row.orderNumber} ref=${row.paystackReference}`);
      continue;
    }
    const result = await backfillPayfastTransactionId(row.paystackReference);
    if (result.updated) {
      updated += 1;
      console.log(`[updated] order ${row.orderNumber} → ${result.payfastPaymentId}`);
    }
  }

  console.log(`[backfill] done — updated=${updated}, skipped=${skipped}`);
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
