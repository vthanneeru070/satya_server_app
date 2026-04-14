const mongoose = require("mongoose");
const { mongoUri } = require("./env");

const connectDatabase = async () => {
  try {
    await mongoose.connect(mongoUri);
    // Keep startup logging minimal but explicit.
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDatabase;
