import { NextResponse } from "next/server";
import { loadDB, saveDB, nextId } from "@/lib/db";
import { getUserFromRequest, hashPassword, createToken } from "@/lib/auth";

// GET /api/auth/invite — list team members in my org
export async function GET(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await loadDB();
  const members = db.users
    .filter((u) => u.organization_id === payload.orgId)
    .map(({ id, email, full_name, role, created_at }) => ({ id, email, full_name, role, created_at }));

  const org = db.orgs.find((o) => o.id === payload.orgId);
  return NextResponse.json({ organization: org?.name, members });
}

// POST /api/auth/invite — invite a new team member (creates account, returns token)
export async function POST(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, full_name, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const db = await loadDB();

  // Check if email already taken
  if (db.users.find((u) => u.email === email)) {
    return NextResponse.json({ error: "Email already registered" }, { status: 400 });
  }

  const hashed = await hashPassword(password);
  const userId = nextId(db);
  db.users.push({
    id: userId,
    email,
    full_name: full_name || email,
    hashed_password: hashed,
    organization_id: payload.orgId,
    role: "member",
    created_at: new Date().toISOString(),
  });

  await saveDB(db);

  // Return a ready-to-use token so the invitee can log in immediately
  const token = await createToken({ sub: email, userId, orgId: payload.orgId });
  return NextResponse.json({ success: true, access_token: token, email }, { status: 201 });
}

// DELETE /api/auth/invite — remove a team member
export async function DELETE(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId: targetId } = await request.json();
  if (!targetId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  // Can't remove yourself
  if (targetId === payload.userId) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  const db = await loadDB();
  const target = db.users.find((u) => u.id === targetId && u.organization_id === payload.orgId);
  if (!target) return NextResponse.json({ error: "User not found in your organization" }, { status: 404 });

  db.users = db.users.filter((u) => u.id !== targetId);
  await saveDB(db);

  return NextResponse.json({ success: true });
}
