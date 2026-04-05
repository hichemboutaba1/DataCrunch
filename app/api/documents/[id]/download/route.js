import { NextResponse } from "next/server";
import { loadDB, loadDocData } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { generateExcel } from "@/lib/excel";

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

    const buffer = await generateExcel(doc, extracted);
    const filename = `datacrunch-${doc.filename.replace(".pdf", "")}-${doc.id}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("Download error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
