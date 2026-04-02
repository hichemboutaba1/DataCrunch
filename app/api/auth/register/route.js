import { NextResponse } from "next/server";
import { loadDB, saveDB, nextId } from "@/lib/db";
import { hashPassword, createToken } from "@/lib/auth";

export async function POST(request) {
  const { email, password, full_name, organization_name } = await request.json();

  if (!email || !password || !organization_name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = loadDB();

  if (db.users.find((u) => u.email === email)) {
    return NextResponse.json({ error: "Email already registered" }, { status: 400 });
  }

  const orgId = nextId(db);
  db.orgs.push({ id: orgId, name: organization_name });

  const subId = nextId(db);
  db.subscriptions.push({
    id: subId,
    organization_id: orgId,
    status: "trialing",
    monthly_quota: 100,
    documents_used: 0,
  });

  const userId = nextId(db);
  const hashed = await hashPassword(password);
  db.users.push({ id: userId, email, hashed_password: hashed, full_name, organization_id: orgId });

  saveDB(db);

  const token = await createToken({ sub: email, userId, orgId });
  return NextResponse.json({ access_token: token }, { status: 201 });
}
