import { NextResponse } from "next/server";
import { loadDB } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = loadDB();
  const user = db.users.find((u) => u.id === payload.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const sub = db.subscriptions.find((s) => s.organization_id === user.organization_id);
  const documents = db.documents
    .filter((d) => d.organization_id === user.organization_id)
    .sort((a, b) => b.id - a.id)
    .slice(0, 10)
    .map(({ excel_buffer, ...d }) => d);

  return NextResponse.json({
    user: { id: user.id, email: user.email, full_name: user.full_name },
    subscription: sub,
    recent_documents: documents,
  });
}
