require("dotenv").config();

const mongoose = require("mongoose");
const admin = require("firebase-admin");

const User = require("../src/models/User");

const initFirebaseAdmin = () => {
  if (admin.apps.length) return;

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
    process.env;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: String(FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n"),
      }),
    });
    console.log(`Firebase Admin initialized (project: ${FIREBASE_PROJECT_ID})`);
    return;
  }

  try {
    const serviceAccount = require("../serviceAccountKeyProd.json");
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log(`Firebase Admin initialized (project: ${serviceAccount.project_id})`);
  } catch {
    throw new Error(
      "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env " +
        "or place serviceAccountKeyProd.json in the project root."
    );
  }
};

initFirebaseAdmin();

async function connectDB() {
  if (!process.env.MONGO_URI) {
    throw new Error("Missing MONGO_URI in .env");
  }

  const dbName = process.env.SUPER_ADMIN_DB_NAME || undefined;
  await mongoose.connect(process.env.MONGO_URI, dbName ? { dbName } : undefined);

  console.log(`MongoDB connected${dbName ? ` (db: ${dbName})` : ""}`);
}

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

async function createSuperAdmin() {
  try {
    await connectDB();

    const email = (process.env.SUPER_ADMIN_EMAIL || "superadmin@sathya.com")
      .toLowerCase()
      .trim();
    const password = process.env.SUPER_ADMIN_PASSWORD || "StrongPassword@123";
    const fullName = process.env.SUPER_ADMIN_FULL_NAME || "Super Admin";

    const firebaseUser = await getOrCreateFirebaseUser({ email, password, fullName });

    const existingMongoUser = await User.findOne({
      $or: [{ email }, { firebaseUid: firebaseUser.uid }],
    });

    if (existingMongoUser) {
      const updates = {};
      if (existingMongoUser.firebaseUid !== firebaseUser.uid) {
        updates.firebaseUid = firebaseUser.uid;
      }
      if (existingMongoUser.role !== "superadmin") {
        updates.role = "superadmin";
      }
      if (!existingMongoUser.canLoginAdminPanel) {
        updates.canLoginAdminPanel = true;
      }
      if (existingMongoUser.provider !== "password") {
        updates.provider = "password";
      }
      if (!Array.isArray(existingMongoUser.linkedProviders) ||
          !existingMongoUser.linkedProviders.includes("password")) {
        updates.linkedProviders = ["password"];
      }

      if (Object.keys(updates).length) {
        Object.assign(existingMongoUser, updates);
        await existingMongoUser.save();
        console.log("Existing admin synced with current Firebase project:");
      } else {
        console.log("Super admin already exists and is in sync:");
      }

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

createSuperAdmin();
