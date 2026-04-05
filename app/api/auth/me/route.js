import { NextResponse } from "next/server";
import { loadDB } from "@/lib/db";
import { authenticate } from "@/lib/auth";

export async function GET(request) {
  try {
    const payload = await authenticate(request);
    if (!payload) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { userId, orgId } = payload;
    const db = await loadDB();

    const user = (db.users || []).find((u) => u.id === userId);
    if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const subscription = (db.subscriptions || []).find((s) => s.organization_id === orgId);

    // Parse query params for filtering
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const typeFilter = url.searchParams.get("type") || "";
    const statusFilter = url.searchParams.get("status") || "";
    const search = url.searchParams.get("search") || "";

    let docs = (db.documents || [])
      .filter((d) => d.organization_id === orgId)
      .map(({ extracted_data, excel_buffer, hashed_password, ...rest }) => rest);

    if (typeFilter) docs = docs.filter((d) => d.document_type === typeFilter);
    if (statusFilter) docs = docs.filter((d) => d.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      docs = docs.filter((d) => d.filename?.toLowerCase().includes(s));
    }

    docs = docs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = docs.length;
    docs = docs.slice(offset, offset + limit);

    return NextResponse.json({
      user: { id: user.id, email: user.email, full_name: user.full_name, organization_id: orgId },
      subscription,
      documents: docs,
      total,
    });
  } catch (err) {
    console.error("Me error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
