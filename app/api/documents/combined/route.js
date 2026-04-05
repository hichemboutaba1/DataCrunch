import { NextResponse } from "next/server";
import { loadDB, loadDocData } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { generateCombinedExcel } from "@/lib/excel";

export async function POST(request) {
  try {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { docIds } = await request.json();
    if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
      return NextResponse.json({ error: "docIds requis (tableau)" }, { status: 400 });
    }
    if (docIds.length > 5) {
      return NextResponse.json({ error: "Maximum 5 documents" }, { status: 400 });
    }

    const db = await loadDB();
    const docs = [];
    const extractedList = [];

    for (const id of docIds) {
      const doc = (db.documents || []).find((d) => d.id === id && d.organization_id === payload.orgId);
      if (!doc) return NextResponse.json({ error: `Document ${id} introuvable` }, { status: 404 });
      if (doc.status !== "completed") {
        return NextResponse.json({ error: `Document ${id} non traité` }, { status: 400 });
      }
      docs.push(doc);
      const extracted = await loadDocData(id);
      extractedList.push(extracted);
    }

    const buffer = await generateCombinedExcel(docs, extractedList);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="datacrunch-rapport-combine.xlsx"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("Combined error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
