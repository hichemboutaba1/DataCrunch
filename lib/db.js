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

// Fetch with a 5-second timeout — prevents Vercel functions from hanging
function fetchWithTimeout(url, opts = {}, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function kvGet() {
  try {
    const res = await fetchWithTimeout(`${KV_URL}/get/${DB_KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const json = await res.json();
    if (!json.result) return null;
    return typeof json.result === "string" ? JSON.parse(json.result) : json.result;
  } catch { return null; }
}

async function kvSet(data) {
  try {
    const value = JSON.stringify(data);
    await fetchWithTimeout(`${KV_URL}/set/${DB_KEY}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
  } catch {}
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
    // KV returned nothing or corrupted data — start fresh
    const fresh = emptyDB();
    await kvSet(fresh);
    return fresh;
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
