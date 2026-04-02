import fs from "fs";

const DB_PATH = "/tmp/datacrunch.json";

function emptyDB() {
  return { users: [], orgs: [], subscriptions: [], documents: [], nextId: 1 };
}

export function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return emptyDB();
  }
}

export function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data));
  } catch {}
}

export function nextId(db) {
  const id = db.nextId;
  db.nextId += 1;
  return id;
}
