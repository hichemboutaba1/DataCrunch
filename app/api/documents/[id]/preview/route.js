import { NextResponse } from "next/server";
import { loadDB } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request, { params }) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await loadDB();
  const doc = db.documents.find(
    (d) => d.id === Number(params.id) && d.organization_id === payload.orgId
  );

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (doc.status !== "completed") return NextResponse.json({ error: "Document not ready" }, { status: 400 });
  if (!doc.extracted_data) return NextResponse.json({ error: "No extracted data available" }, { status: 404 });

  // Return extracted_data without the heavy excel_buffer
  const { excel_buffer: _, ...rest } = doc;
  return NextResponse.json(rest);
}
