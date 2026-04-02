import { NextResponse } from "next/server";
import { loadDB } from "@/lib/db";
import { verifyPassword, createToken } from "@/lib/auth";

export async function POST(request) {
  const { email, password } = await request.json();
  const db = loadDB();
  const user = db.users.find((u) => u.email === email);

  if (!user || !(await verifyPassword(password, user.hashed_password))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createToken({ sub: email, userId: user.id, orgId: user.organization_id });
  return NextResponse.json({ access_token: token });
}
