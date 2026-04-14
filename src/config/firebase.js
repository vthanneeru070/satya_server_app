const admin = require("firebase-admin");
const {
  firebaseProjectId,
  firebaseClientEmail,
  firebasePrivateKey,
} = require("./env");

if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
  throw new Error(
    "Missing Firebase environment variables. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env"
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: firebaseProjectId,
      clientEmail: firebaseClientEmail,
      // Private keys in .env are commonly escaped with \n.
      privateKey: String(firebasePrivateKey).replace(/\\n/g, "\n"),
    }),
  });
}

module.exports = admin;
