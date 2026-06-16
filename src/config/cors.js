const DEFAULT_ORIGINS = [
  "https://admin.sathya.co.za",
  "https://admin-test.sathya.co.za",
  "http://localhost:3000",
  "http://localhost:8080",
];

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

const corsOptions = {
  origin(origin, callback) {
    // Mobile apps, curl, Postman, same-origin server calls
    if (!origin) {
      return callback(null, true);
    }

    const allowed = parseOrigins();
    if (allowed.includes(origin) || allowed.includes("*")) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  maxAge: 86400,
};

module.exports = { corsOptions, parseOrigins };
