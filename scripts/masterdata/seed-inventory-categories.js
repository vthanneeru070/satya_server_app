require("dotenv").config();
const mongoose = require("mongoose");
const { inventory } = require("../../src/masterdata");

const mongoUri = process.env.MONGO_URI;

const run = async () => {
  if (!mongoUri) {
    throw new Error("Missing required environment variable: MONGO_URI");
  }
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");

  const result = await inventory.categories.seed();
  console.log("Inventory categories seeded:", result);

  await mongoose.connection.close();
};

run().catch((err) => {
  console.error("seed-inventory-categories failed:", err.message || err);
  process.exit(1);
});
