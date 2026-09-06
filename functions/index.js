const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) admin.initializeApp();

// Browser origins allowed to call this function. Auth is the real gate
// (see verifyCaller); CORS only stops other sites from calling it from a
// user's browser. Override with ALLOWED_ORIGINS="https://a.com,https://b.com".
const PROJECT_ID = process.env.GCLOUD_PROJECT || "";
const DEFAULT_ORIGINS = [
  PROJECT_ID && `https://${PROJECT_ID}.web.app`,
  PROJECT_ID && `https://${PROJECT_ID}.firebaseapp.com`,
  "https://gengemz.com",
  "https://www.gengemz.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5002",
  "http://127.0.0.1:5002",
].filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const CORS_ORIGINS = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

const RAWG_API_KEY = defineSecret("RAWG_API_KEY");

const ALLOWED_ORDERINGS = new Set([
  "-metacritic",
  "-rating",
  "-added",
  "-released",
]);
const ALLOWED_QUERY_PARAMS = new Set([
  "search",
  "ordering",
  "page_size",
  "dates",
  "platforms",
]);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;
const requestLog = new Map();
const responseCache = new Map();

const cleanString = (value, maxLength = 100) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const cleanPageSize = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 10;
  return Math.min(Math.max(parsed, 1), 50);
};

const isValidCsvIds = (value) => {
  if (!value) return true;
  return /^[0-9]+(,[0-9]+)*$/.test(value);
};

const isValidDates = (value) => {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}(,\d{4}-\d{2}-\d{2})?$/.test(value);
};

const hasOnlyAllowedQueryParams = (query) => {
  return Object.keys(query).every((key) => ALLOWED_QUERY_PARAMS.has(key));
};

// Requires a Firebase ID token (anonymous users have one too). Returns the
// uid, or null. The rate limiter is keyed on the uid, never on a
// client-controlled header like X-Forwarded-For.
const verifyCaller = async (req) => {
  const header = req.headers.authorization || "";
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded.uid || null;
  } catch (error) {
    console.warn("Rejected ID token:", error.code || error.message);
    return null;
  }
};

const isRateLimited = (key) => {
  const now = Date.now();
  const requests = (requestLog.get(key) || []).filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(key, requests);
    return true;
  }
  requests.push(now);
  requestLog.set(key, requests);

  if (requestLog.size > 1000) {
    for (const [clientKey, clientRequests] of requestLog.entries()) {
      const activeRequests = clientRequests.filter(
          (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
      );
      if (activeRequests.length) {
        requestLog.set(clientKey, activeRequests);
      } else {
        requestLog.delete(clientKey);
      }
    }
  }

  return false;
};

const pruneCache = () => {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      responseCache.delete(key);
    }
  }

  while (responseCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
};

const getCachedResponse = (cacheKey) => {
  const cached = responseCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    responseCache.delete(cacheKey);
    return null;
  }
  return cached.data;
};

const setCachedResponse = (cacheKey, data) => {
  responseCache.set(cacheKey, {
    data,
    createdAt: Date.now(),
  });
  pruneCache();
};

const buildRawgParams = (req, apiKey) => {
  if (!hasOnlyAllowedQueryParams(req.query)) {
    return {error: "Unsupported query parameter"};
  }

  const query = cleanString(req.query.search, 120);
  const ordering = cleanString(req.query.ordering, 30);
  const pageSize = cleanPageSize(req.query.page_size);
  const dates = cleanString(req.query.dates, 25);
  const platforms = cleanString(req.query.platforms, 80);

  if (!query && !ordering && !dates && !platforms) {
    return {error: "At least one search or browse filter is required"};
  }

  if (ordering && !ALLOWED_ORDERINGS.has(ordering)) {
    return {error: "Invalid ordering"};
  }

  if (!isValidDates(dates)) {
    return {error: "Invalid dates filter"};
  }

  if (!isValidCsvIds(platforms)) {
    return {error: "Invalid platforms filter"};
  }

  const publicParams = new URLSearchParams();
  if (query) publicParams.append("search", query);
  if (ordering) publicParams.append("ordering", ordering);
  publicParams.append("page_size", pageSize);
  if (dates) publicParams.append("dates", dates);
  if (platforms) publicParams.append("platforms", platforms);

  const rawgParams = new URLSearchParams(publicParams);
  rawgParams.append("key", apiKey);

  return {
    cacheKey: publicParams.toString(),
    rawgParams,
  };
};

exports.searchGames = onRequest(
    {
      cors: CORS_ORIGINS,
      secrets: [RAWG_API_KEY],
    },
    async (req, res) => {
      if (req.method !== "GET") {
        return res.status(405).json({error: "Method Not Allowed"});
      }

      const apiKey = RAWG_API_KEY.value();
      if (!apiKey) {
        return res.status(500).json({
          error: "RAWG API key is not configured",
        });
      }

      const uid = await verifyCaller(req);
      if (!uid) {
        return res.status(401).json({error: "Unauthorized"});
      }

      if (isRateLimited(uid)) {
        return res.status(429).json({error: "Too Many Requests"});
      }

      const params = buildRawgParams(req, apiKey);
      if (params.error) {
        return res.status(400).json({error: params.error});
      }

      const cached = getCachedResponse(params.cacheKey);
      if (cached) {
        res.set("Cache-Control", "private, max-age=300");
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }

      try {
        const rawgUrl = "https://api.rawg.io/api/games?" +
          params.rawgParams.toString();
        const response = await fetch(rawgUrl, {timeout: 8000});
        if (!response.ok) {
          throw new Error(`RAWG request failed with ${response.status}`);
        }

        const data = await response.json();
        setCachedResponse(params.cacheKey, data);
        res.set("Cache-Control", "private, max-age=300");
        res.set("X-Cache", "MISS");
        return res.json(data);
      } catch (error) {
        console.error("Error fetching games:", error);
        return res.status(500).json({error: "Internal Server Error"});
      }
    },
);
