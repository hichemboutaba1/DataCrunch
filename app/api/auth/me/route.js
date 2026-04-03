import { NextResponse } from "next/server";
import { loadDB } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 100), 200);
  const offset = Number(searchParams.get("offset") || 0);
  const typeFilter = searchParams.get("type") || "";
  const statusFilter = searchParams.get("status") || "";
  const search = searchParams.get("search") || "";

  const db = loadDB();
  const user = db.users.find((u) => u.id === payload.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const sub = db.subscriptions.find((s) => s.organization_id === user.organization_id);

  let documents = db.documents
    .filter((d) => d.organization_id === user.organization_id)
    .sort((a, b) => b.id - a.id);

  // Apply filters
  if (typeFilter) documents = documents.filter(d => d.document_type === typeFilter);
  if (statusFilter) documents = documents.filter(d => d.status === statusFilter);
  if (search) {
    const q = search.toLowerCase();
    documents = documents.filter(d => d.filename?.toLowerCase().includes(q));
  }

  const total = documents.length;
  const page = documents
    .slice(offset, offset + limit)
    .map(({ excel_buffer, extracted_data, ...d }) => d);  // strip heavy fields

  return NextResponse.json({
    user: { id: user.id, email: user.email, full_name: user.full_name },
    subscription: sub,
    documents: page,
    total,
    limit,
    offset,
  });
}
