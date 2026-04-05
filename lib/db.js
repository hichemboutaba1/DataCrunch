import fs from "fs";
import path from "path";

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const TMP_FILE = "/tmp/datacrunch.json";
const DB_KEY = "datacrunch:db";

const EMPTY_DB = {
  users: [],
  orgs: [],
  subscriptions: [],
  documents: [],
  nextId: 1,
};

async function kvGet(key) {
  if (!KV_URL || !KV_TOKEN) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${KV_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["GET", key]]),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0]?.result ?? null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function kvSet(key, value) {
  if (!KV_URL || !KV_TOKEN) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${KV_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["SET", key, value]]),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

export async function loadDB() {
  // Try Upstash first
  const raw = await kvGet(DB_KEY);
  if (raw) {
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      // fall through
    }
  }
  // Fallback: local tmp file
  try {
    if (fs.existsSync(TMP_FILE)) {
      const content = fs.readFileSync(TMP_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // fall through
  }
  return { ...EMPTY_DB };
}

export async function saveDB(db) {
  // Strip extracted_data and excel_buffer from documents before saving main DB key
  const docsSafe = (db.documents || []).map((doc) => {
    const { extracted_data, excel_buffer, ...rest } = doc;
    return rest;
  });
  const dbSafe = { ...db, documents: docsSafe };
  const serialized = JSON.stringify(dbSafe);

  // Save extracted_data separately
  for (const doc of db.documents || []) {
    if (doc.extracted_data) {
      await kvSet(`datacrunch:doc:${doc.id}`, JSON.stringify(doc.extracted_data));
    }
  }

  // Save main DB
  const ok = await kvSet(DB_KEY, serialized);
  if (!ok) {
    // Fallback: local tmp file
    try {
      fs.writeFileSync(TMP_FILE, serialized, "utf-8");
    } catch {
      // ignore
    }
  }
  // Also always write local fallback when not in production
  if (process.env.NODE_ENV !== "production") {
    try {
      fs.writeFileSync(TMP_FILE, serialized, "utf-8");
    } catch {
      // ignore
    }
  }
  return ok;
}

export async function loadDocData(docId) {
  const raw = await kvGet(`datacrunch:doc:${docId}`);
  if (raw) {
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }
  // Fallback: check in-memory tmp
  try {
    if (fs.existsSync(TMP_FILE)) {
      const db = JSON.parse(fs.readFileSync(TMP_FILE, "utf-8"));
      const doc = (db.documents || []).find((d) => d.id === docId);
      if (doc?.extracted_data) return doc.extracted_data;
    }
  } catch {
    // ignore
  }
  return null;
}

export function nextId(db) {
  const id = db.nextId || 1;
  db.nextId = id + 1;
  return String(id);
}
