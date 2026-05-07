require("dotenv").config();

const mongoose = require("mongoose");
const admin = require("firebase-admin");

const User = require("../src/models/User");

// 🔥 Firebase service account
const serviceAccount = require("../serviceAccountKey.json");

// 🔥 Initialize Firebase Admin SDK (skip if already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// 🔥 MongoDB connection
async function connectDB() {
  if (!process.env.MONGO_URI) {
    throw new Error("Missing MONGO_URI in .env");
  }

  const dbName = process.env.SUPER_ADMIN_DB_NAME || "satya_auth";
  await mongoose.connect(process.env.MONGO_URI, { dbName });

  console.log(`MongoDB connected (db: ${dbName})`);
}

// 🔥 Get or create the Firebase Auth user.
// Idempotent: if the user already exists in Firebase, we re-use that uid.
async function getOrCreateFirebaseUser({ email, password, fullName }) {
  try {
    const existing = await admin.auth().getUserByEmail(email);
    console.log(`Firebase user already exists. Re-using uid=${existing.uid}`);
    return existing;
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
  }

  const created = await admin.auth().createUser({
    email,
    password,
    displayName: fullName,
    emailVerified: true,
  });

  console.log("Firebase user created");
  return created;
}

// 🔥 Create Super Admin
async function createSuperAdmin() {
  try {
    await connectDB();

    const email = (process.env.SUPER_ADMIN_EMAIL || "superadmin@sathya.com").toLowerCase().trim();
    const password = process.env.SUPER_ADMIN_PASSWORD || "StrongPassword@123";
    const fullName = process.env.SUPER_ADMIN_FULL_NAME || "Super Admin";

    // 🔍 Check existing super admin in MongoDB
    const existingMongoUser = await User.findOne({
      $or: [{ email }, { role: "superadmin" }],
    });

    if (existingMongoUser) {
      console.log("Super admin already exists");
      console.log({
        id: existingMongoUser._id.toString(),
        email: existingMongoUser.email,
        firebaseUid: existingMongoUser.firebaseUid,
        role: existingMongoUser.role,
        canLoginAdminPanel: existingMongoUser.canLoginAdminPanel,
        provider: existingMongoUser.provider,
      });
      process.exit(0);
    }

    // 🔥 Get or create the Firebase Auth user (idempotent)
    const firebaseUser = await getOrCreateFirebaseUser({ email, password, fullName });

    // 🔥 Save MongoDB user
    const user = await User.create({
      firebaseUid: firebaseUser.uid,
      email,
      fullName,
      provider: "password",
      linkedProviders: ["password"],
      role: "superadmin",
      canLoginAdminPanel: true,
      emailVerified: true,
    });

    console.log("MongoDB user created");

    console.log({
      email,
      password,
      userId: user._id.toString(),
      firebaseUid: firebaseUser.uid,
      role: user.role,
      canLoginAdminPanel: user.canLoginAdminPanel,
    });

    process.exit(0);
  } catch (error) {
    console.error("Error creating super admin");
    console.error(error);
    process.exit(1);
  }
}

// 🔥 Run script
createSuperAdmin();
