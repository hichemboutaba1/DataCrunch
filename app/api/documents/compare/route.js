import { NextResponse } from "next/server";
import { loadDB, loadDocData } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { generateCompareExcel } from "@/lib/excel";

export async function GET(request) {
  try {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const url = new URL(request.url);
    const idA = url.searchParams.get("idA");
    const idB = url.searchParams.get("idB");

    if (!idA || !idB) return NextResponse.json({ error: "idA et idB requis" }, { status: 400 });

    const db = await loadDB();
    const docs = db.documents || [];

    const docA = docs.find((d) => d.id === idA && d.organization_id === payload.orgId);
    const docB = docs.find((d) => d.id === idB && d.organization_id === payload.orgId);

    if (!docA || !docB) return NextResponse.json({ error: "Documents introuvables" }, { status: 404 });

    const extractedA = await loadDocData(idA);
    const extractedB = await loadDocData(idB);

    if (!extractedA || !extractedB) {
      return NextResponse.json({ error: "Données extraites manquantes" }, { status: 404 });
    }

    // Return comparison data (no export)
    const buildMetrics = (ex) => ({
      company_name: ex.company_name,
      period: ex.period,
      currency: ex.currency,
      revenue: ex.revenue?.total_stated,
      expenses: ex.expenses?.total_stated,
      ebitda: ex.ebitda,
      net_income: ex.net_income,
      assets: ex.assets?.total_stated,
      liabilities: ex.liabilities?.total_stated,
    });

    return NextResponse.json({
      docA: { ...docA, metrics: buildMetrics(extractedA) },
      docB: { ...docB, metrics: buildMetrics(extractedB) },
    });
  } catch (err) {
    console.error("Compare GET error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { idA, idB } = await request.json();
    if (!idA || !idB) return NextResponse.json({ error: "idA et idB requis" }, { status: 400 });

    const db = await loadDB();
    const docs = db.documents || [];

    const docA = docs.find((d) => d.id === idA && d.organization_id === payload.orgId);
    const docB = docs.find((d) => d.id === idB && d.organization_id === payload.orgId);
    if (!docA || !docB) return NextResponse.json({ error: "Documents introuvables" }, { status: 404 });

    const extractedA = await loadDocData(idA);
    const extractedB = await loadDocData(idB);
    if (!extractedA || !extractedB) {
      return NextResponse.json({ error: "Données extraites manquantes" }, { status: 404 });
    }

    const buffer = await generateCompareExcel(docA, docB, extractedA, extractedB);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="datacrunch-comparaison-N-vs-N1.xlsx"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("Compare POST error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
