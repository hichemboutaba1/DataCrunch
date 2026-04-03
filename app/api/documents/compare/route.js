import { NextResponse } from "next/server";
import { loadDB } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { generateComparisonExcel } from "@/lib/excel";

function buildMetrics(docA, docB) {
  const metrics = [];

  // Revenue
  if (docA.revenue || docB.revenue) {
    metrics.push({ section: "Revenue", label: "Total Revenue", a: docA.revenue?.total_calculated, b: docB.revenue?.total_calculated, bold: true });
    const allLabels = new Set([
      ...(docA.revenue?.items || []).map(i => i.label),
      ...(docB.revenue?.items || []).map(i => i.label),
    ]);
    for (const label of allLabels) {
      const itemA = docA.revenue?.items?.find(i => i.label === label);
      const itemB = docB.revenue?.items?.find(i => i.label === label);
      metrics.push({ section: "Revenue", label, a: itemA?.amount ?? null, b: itemB?.amount ?? null });
    }
  }

  // Expenses
  if (docA.expenses || docB.expenses) {
    metrics.push({ section: "Expenses", label: "Total Expenses", a: docA.expenses?.total_calculated, b: docB.expenses?.total_calculated, bold: true });
    const allLabels = new Set([
      ...(docA.expenses?.items || []).map(i => i.label),
      ...(docB.expenses?.items || []).map(i => i.label),
    ]);
    for (const label of allLabels) {
      const itemA = docA.expenses?.items?.find(i => i.label === label);
      const itemB = docB.expenses?.items?.find(i => i.label === label);
      metrics.push({ section: "Expenses", label, a: itemA?.amount ?? null, b: itemB?.amount ?? null });
    }
  }

  // EBITDA & Net Income
  if (docA.ebitda != null || docB.ebitda != null) {
    metrics.push({ section: "Profitability", label: "EBITDA", a: docA.ebitda, b: docB.ebitda, bold: true });
  }
  if (docA.net_income != null || docB.net_income != null) {
    metrics.push({ section: "Profitability", label: "Net Income", a: docA.net_income, b: docB.net_income, bold: true });
  }

  // Balance Sheet
  if (docA.assets || docB.assets) {
    metrics.push({ section: "Balance Sheet", label: "Total Assets", a: docA.assets?.total_calculated, b: docB.assets?.total_calculated, bold: true });
  }
  if (docA.liabilities || docB.liabilities) {
    metrics.push({ section: "Balance Sheet", label: "Total Liabilities", a: docA.liabilities?.total_calculated, b: docB.liabilities?.total_calculated, bold: true });
    const eqA = docA.assets?.total_calculated != null && docA.liabilities?.total_calculated != null
      ? docA.assets.total_calculated - docA.liabilities.total_calculated : null;
    const eqB = docB.assets?.total_calculated != null && docB.liabilities?.total_calculated != null
      ? docB.assets.total_calculated - docB.liabilities.total_calculated : null;
    metrics.push({ section: "Balance Sheet", label: "Net Equity", a: eqA, b: eqB, bold: true });
  }

  return metrics;
}

export async function GET(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const idA = Number(searchParams.get("a"));
  const idB = Number(searchParams.get("b"));

  if (!idA || !idB) return NextResponse.json({ error: "Provide ?a=ID&b=ID" }, { status: 400 });

  const db = await loadDB();
  const docA = db.documents.find(d => d.id === idA && d.organization_id === payload.orgId);
  const docB = db.documents.find(d => d.id === idB && d.organization_id === payload.orgId);

  if (!docA || !docB) return NextResponse.json({ error: "Document(s) not found" }, { status: 404 });
  if (!docA.extracted_data || !docB.extracted_data) {
    return NextResponse.json({ error: "Both documents must have extracted data" }, { status: 400 });
  }

  const metrics = buildMetrics(docA.extracted_data, docB.extracted_data);
  const comparison = { metrics };

  return NextResponse.json({
    docA: { id: docA.id, filename: docA.filename, period: docA.extracted_data.period },
    docB: { id: docB.id, filename: docB.filename, period: docB.extracted_data.period },
    comparison,
  });
}

export async function POST(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const idA = Number(searchParams.get("a"));
  const idB = Number(searchParams.get("b"));

  if (!idA || !idB) return NextResponse.json({ error: "Provide ?a=ID&b=ID" }, { status: 400 });

  const db = await loadDB();
  const docA = db.documents.find(d => d.id === idA && d.organization_id === payload.orgId);
  const docB = db.documents.find(d => d.id === idB && d.organization_id === payload.orgId);

  if (!docA || !docB) return NextResponse.json({ error: "Document(s) not found" }, { status: 404 });
  if (!docA.extracted_data || !docB.extracted_data) {
    return NextResponse.json({ error: "Both documents must have extracted data" }, { status: 400 });
  }

  try {
    const metrics = buildMetrics(docA.extracted_data, docB.extracted_data);
    const excelBuffer = await generateComparisonExcel(docA.extracted_data, docB.extracted_data, { metrics });

    return new Response(excelBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="DataCrunch_Comparison_NvsN1.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
