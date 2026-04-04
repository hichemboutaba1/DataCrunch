import fs from "fs";

const DB_PATH = "/tmp/datacrunch.json";

function emptyDB() {
  return { users: [], orgs: [], subscriptions: [], documents: [], nextId: 1 };
}

// ─── Upstash Redis / Vercel KV (persistent) ──────────────────────────────────
const KV_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const DB_KEY   = "datacrunch:db";
const useKV    = !!(KV_URL && KV_TOKEN);

// Fetch with a 10-second timeout — prevents Vercel functions from hanging
function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Use Upstash pipeline API — the standard reliable format
async function kvGet() {
  try {
    const res = await fetchWithTimeout(`${KV_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["GET", DB_KEY]]),
    });
    if (!res.ok) {
      console.error("kvGet HTTP error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const result = json[0]?.result;
    if (!result) return null;
    return typeof result === "string" ? JSON.parse(result) : result;
  } catch (err) {
    console.error("kvGet error:", err.message);
    return null;
  }
}

// Strip large binary fields before saving to KV — excel_buffer can be 1MB+
// as a JSON number array, which exceeds Upstash limits.
// Excel files are regenerated on-demand from extracted_data at download time.
function stripForKV(data) {
  return {
    ...data,
    documents: data.documents.map(({ excel_buffer, ...doc }) => doc),
  };
}

async function kvSet(data) {
  try {
    const value = JSON.stringify(stripForKV(data));
    const res = await fetchWithTimeout(`${KV_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["SET", DB_KEY, value]]),
    });
    if (!res.ok) {
      console.error("kvSet HTTP error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("kvSet error:", err.message);
  }
}

// ─── /tmp JSON (fallback / local dev) ─────────────────────────────────────────
function fileLoad() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")); }
  catch { return emptyDB(); }
}

function fileSave(data) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(data)); } catch {}
}

// ─── Public API ────────────────────────────────────────────────────────────────
function isValidDB(data) {
  return data && Array.isArray(data.users) && Array.isArray(data.documents);
}

export async function loadDB() {
  if (useKV) {
    const data = await kvGet();
    if (isValidDB(data)) {
      fileSave(data);
      return data;
    }
    // KV returned nothing or error — return empty in-memory only.
    // IMPORTANT: do NOT save to KV here, to avoid destroying existing data
    // on a transient connection failure.
    return emptyDB();
  }
  const data = fileLoad();
  return isValidDB(data) ? data : emptyDB();
}

export async function saveDB(data) {
  if (useKV) {
    await kvSet(data);
    fileSave(data);
    return;
  }
  fileSave(data);
}

export function nextId(db) {
  const id = db.nextId;
  db.nextId += 1;
  return id;
}
