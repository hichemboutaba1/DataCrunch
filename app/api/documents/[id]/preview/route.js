import { NextResponse } from "next/server";
import { loadDB, loadDocData } from "@/lib/db";
import { authenticate } from "@/lib/auth";

export async function GET(request, { params }) {
  try {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { id } = params;
    const db = await loadDB();
    const doc = (db.documents || []).find((d) => d.id === id && d.organization_id === payload.orgId);
    if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

    const extracted_data = await loadDocData(id);

    return NextResponse.json({ ...doc, extracted_data });
  } catch (err) {
    console.error("Preview error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
