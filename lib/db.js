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

// 10s timeout — prevents Vercel functions from hanging on slow Upstash
function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Run multiple Redis commands in one HTTP round-trip
async function pipeline(commands) {
  const res = await fetchWithTimeout(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upstash pipeline error ${res.status}: ${txt}`);
  }
  return res.json();
}

// ─── Main DB key ─────────────────────────────────────────────────────────────
// Strip heavy fields before saving to the main DB key.
// excel_buffer  → regenerated at download time from extracted_data
// extracted_data → stored in a separate per-document key (datacrunch:doc:{id})
function stripForKV(data) {
  return {
    ...data,
    documents: data.documents.map(({ excel_buffer, extracted_data, ...doc }) => doc),
  };
}

async function kvGet() {
  try {
    const json = await pipeline([["GET", DB_KEY]]);
    const result = json[0]?.result;
    if (!result) return null;
    return typeof result === "string" ? JSON.parse(result) : result;
  } catch (err) {
    console.error("kvGet error:", err.message);
    return null;
  }
}

// Save main DB + all in-memory extracted_data in one batched pipeline.
// Batches of 8 commands keep each request well under Upstash's 1 MB limit.
async function kvSaveAll(data) {
  try {
    const commands = [["SET", DB_KEY, JSON.stringify(stripForKV(data))]];

    for (const doc of data.documents) {
      if (doc.extracted_data) {
        commands.push(["SET", `datacrunch:doc:${doc.id}`, JSON.stringify(doc.extracted_data)]);
      }
    }

    // Flush in batches of 8
    for (let i = 0; i < commands.length; i += 8) {
      await pipeline(commands.slice(i, i + 8));
    }
  } catch (err) {
    console.error("kvSaveAll error:", err.message);
    throw err; // propagate so callers know the write failed
  }
}

// ─── Per-document extracted_data key ─────────────────────────────────────────
export async function loadDocData(docId) {
  if (!useKV) {
    // Local dev: extracted_data lives in the main /tmp file
    const db = fileLoad();
    return db.documents?.find((d) => d.id === docId)?.extracted_data ?? null;
  }
  try {
    const json = await pipeline([["GET", `datacrunch:doc:${docId}`]]);
    const result = json[0]?.result;
    if (!result) return null;
    return typeof result === "string" ? JSON.parse(result) : result;
  } catch (err) {
    console.error("loadDocData error:", err.message);
    return null;
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
    // KV unavailable or empty — return in-memory empty, do NOT overwrite
    return emptyDB();
  }
  const data = fileLoad();
  return isValidDB(data) ? data : emptyDB();
}

export async function saveDB(data) {
  if (useKV) {
    await kvSaveAll(data);
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
