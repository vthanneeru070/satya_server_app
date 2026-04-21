require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

const { SUPER_ADMIN_EMAIL, SUPER_ADMIN_FIREBASE_UID, SUPER_ADMIN_PROVIDER } = process.env;
const superAdminDbName = process.env.SUPER_ADMIN_DB_NAME || "satya_auth";
const mongoUri = process.env.MONGO_URI;


const logSuperAdminDetails = (label, user) => {
  console.log(
    label,
    JSON.stringify(
      {
        id: user._id.toString(),
        email: user.email,
        firebaseUid: user.firebaseUid,
        role: user.role,
        isSuperAdmin: user.isSuperAdmin,
        provider: user.provider,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      null,
      2
    )
  );
};

const createSuperAdmin = async () => {
  if (!SUPER_ADMIN_EMAIL) {
    throw new Error("Missing required environment variable: SUPER_ADMIN_EMAIL");
  }

  if (!SUPER_ADMIN_FIREBASE_UID) {
    throw new Error("Missing required environment variable: SUPER_ADMIN_FIREBASE_UID");
  }

  if (!mongoUri) {
    throw new Error("Missing required environment variable: MONGO_URI");
  }

  await mongoose.connect(mongoUri, { dbName: superAdminDbName });
  console.log(`MongoDB connected successfully (db: ${superAdminDbName})`);

  try {
    const existingSuperAdmin = await User.findOne({ isSuperAdmin: true });

    if (existingSuperAdmin) {
      console.log("Super admin already exists. No action taken.");
      logSuperAdminDetails("Existing super admin details:", existingSuperAdmin);
      return;
    }

    const existingUser = await User.findOne({
      $or: [
        { email: SUPER_ADMIN_EMAIL.toLowerCase().trim() },
        { firebaseUid: SUPER_ADMIN_FIREBASE_UID.trim() },
      ],
    });

    if (existingUser) {
      existingUser.email = SUPER_ADMIN_EMAIL.toLowerCase().trim();
      existingUser.role = "admin";
      existingUser.isSuperAdmin = true;
      existingUser.createdBy = null;
      await existingUser.save();
      console.log("Existing user elevated to super admin.");
      logSuperAdminDetails("Elevated super admin details:", existingUser);
      return;
    }

    const createdSuperAdmin = await User.create({
      firebaseUid: SUPER_ADMIN_FIREBASE_UID.trim(),
      email: SUPER_ADMIN_EMAIL.toLowerCase().trim(),
      provider: SUPER_ADMIN_PROVIDER || "google",
      role: "admin",
      isSuperAdmin: true,
      createdBy: null,
    });

    console.log("Super admin created successfully.");
    logSuperAdminDetails("Created super admin details:", createdSuperAdmin);
  } finally {
    await mongoose.connection.close();
  }
};

if (require.main === module) {
  createSuperAdmin()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Failed to create super admin:", error.message);
      process.exit(1);
    });
}

module.exports = createSuperAdmin;
