import fs from "fs";

const DB_PATH = "/tmp/datacrunch.json";

function emptyDB() {
  return { users: [], orgs: [], subscriptions: [], documents: [], nextId: 1 };
}

// ─── Vercel KV (persistent) ────────────────────────────────────────────────────
const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const DB_KEY   = "datacrunch:db";
const useKV    = !!(KV_URL && KV_TOKEN);

async function kvGet() {
  try {
    const res = await fetch(`${KV_URL}/get/${DB_KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const json = await res.json();
    if (!json.result) return null;
    // Vercel KV returns the value as a JSON string
    return typeof json.result === "string" ? JSON.parse(json.result) : json.result;
  } catch { return null; }
}

async function kvSet(data) {
  try {
    await fetch(`${KV_URL}/set/${DB_KEY}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["set", DB_KEY, JSON.stringify(data)]),
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
export async function loadDB() {
  if (useKV) {
    const data = await kvGet();
    if (data) {
      // Also write to /tmp as local cache
      fileSave(data);
      return data;
    }
    // KV empty — try /tmp seed
    const seed = fileLoad();
    if (seed.users?.length) await kvSet(seed); // migrate existing data
    return seed;
  }
  return fileLoad();
}

export async function saveDB(data) {
  if (useKV) {
    await kvSet(data);
    fileSave(data); // also keep local cache for speed
    return;
  }
  fileSave(data);
}

export function nextId(db) {
  const id = db.nextId;
  db.nextId += 1;
  return id;
}
