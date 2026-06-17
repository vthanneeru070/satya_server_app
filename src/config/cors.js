const DEFAULT_ORIGINS = [
  "https://admin-test.sathya.co.za",
  "https://admin-test.satya.co.za",
  "https://admin.sathya.co.za",
  "https://admin.sathya.co.za",
  "http://localhost:3000",
  "http://localhost:8080",
];

/** https://admin-test.sathya.co.za, https://admin.sathya.co.za, etc. (both spellings) */
const SATYA_ORIGIN_PATTERN =
  /^https:\/\/([a-z0-9-]+\.)*(satya|sathya)\.co\.za$/i;

const LOCALHOST_ORIGIN_PATTERN = /^http:\/\/localhost(:\d+)?$/i;

const parseOrigins = () => {
  const raw = process.env.CORS_ORIGINS;
  if (!raw || !String(raw).trim()) {
    return DEFAULT_ORIGINS;
  }
  return String(raw)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const isOriginAllowed = (origin) => {
  if (!origin) return true;

  const allowed = parseOrigins();
  if (allowed.includes("*")) return true;
  if (allowed.includes(origin)) return true;
  if (SATYA_ORIGIN_PATTERN.test(origin)) return true;
  if (LOCALHOST_ORIGIN_PATTERN.test(origin)) return true;

  return false;
};

const corsOptions = {
  origin(origin, callback) {
    // Mobile apps, curl, Postman, server-to-server
    if (!origin) {
      return callback(null, true);
    }

    if (isOriginAllowed(origin)) {
      // Reflect the requesting origin (required when credentials: true)
      return callback(null, origin);
    }

    console.warn(`[cors] blocked origin: ${origin}`);
    // Do NOT pass an Error — that becomes HTTP 403 and breaks OPTIONS preflight.
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // Omit allowedHeaders so cors reflects Access-Control-Request-Headers from the client.
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

module.exports = { corsOptions, parseOrigins, isOriginAllowed };
