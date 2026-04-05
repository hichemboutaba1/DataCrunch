import { NextResponse } from "next/server";
import { loadDB, loadDocData } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { generateDOCX } from "@/lib/docx";

export async function GET(request, { params }) {
  try {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { id } = params;
    const db = await loadDB();
    const doc = (db.documents || []).find((d) => d.id === id && d.organization_id === payload.orgId);
    if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    if (doc.status !== "completed") {
      return NextResponse.json({ error: "Document non traité" }, { status: 400 });
    }

    const extracted = await loadDocData(id);
    if (!extracted) return NextResponse.json({ error: "Données extraites introuvables" }, { status: 404 });

    const buffer = await generateDOCX(doc, extracted);
    const filename = `datacrunch-${doc.filename.replace(".pdf", "")}-${doc.id}.docx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("DOCX error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
