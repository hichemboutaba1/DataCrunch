import { NextResponse } from "next/server";
import { loadDB } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { generatePowerPoint } from "@/lib/powerpoint";

export async function GET(request, { params }) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = loadDB();
  const doc = db.documents.find(
    (d) => d.id === Number(params.id) && d.organization_id === payload.orgId
  );

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (doc.status !== "completed") return NextResponse.json({ error: "Document not ready" }, { status: 400 });
  if (!doc.extracted_data) return NextResponse.json({ error: "No extracted data available" }, { status: 404 });

  try {
    const pptBuffer = await generatePowerPoint(doc.extracted_data);
    const filename = doc.filename.replace(".pdf", "") + "_DataCrunch.pptx";

    return new Response(pptBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
