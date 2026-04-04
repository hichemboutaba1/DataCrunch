import { NextResponse } from "next/server";
import { loadDB, loadDocData } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { generateDocx } from "@/lib/docx";
import { analyzeRedFlags } from "@/lib/redflags";

export async function GET(request, { params }) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await loadDB();
  const doc = db.documents.find(
    (d) => d.id === Number(params.id) && d.organization_id === payload.orgId
  );

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (doc.status !== "completed") return NextResponse.json({ error: "Document not ready" }, { status: 400 });

  const extracted_data = await loadDocData(doc.id);
  if (!extracted_data) return NextResponse.json({ error: "No extracted data available" }, { status: 404 });

  try {
    const riskData = analyzeRedFlags(extracted_data);
    const docxBuffer = await generateDocx(extracted_data, riskData);
    const filename = doc.filename.replace(/\.pdf$/i, "") + "_DataCrunch.docx";

    return new Response(docxBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
