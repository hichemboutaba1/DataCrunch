import { NextResponse } from "next/server";
import { loadDB, saveDB, nextId } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { extractPdfText } from "@/lib/pdf";
import { extractFinancialData } from "@/lib/ai";
import { validateExtraction } from "@/lib/validate";
import { generateExcel } from "@/lib/excel";

export async function POST(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const documentType = formData.get("document_type") || "financial_statement";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.name.endsWith(".pdf")) return NextResponse.json({ error: "Only PDF files accepted" }, { status: 400 });

  const db = loadDB();
  const sub = db.subscriptions.find((s) => s.organization_id === payload.orgId);

  if (!sub || !["active", "trialing"].includes(sub.status)) {
    return NextResponse.json({ error: "No active subscription" }, { status: 402 });
  }

  const docId = nextId(db);
  const doc = {
    id: docId,
    organization_id: payload.orgId,
    user_id: payload.userId,
    filename: file.name,
    document_type: documentType,
    status: "processing",
    is_overage: sub.documents_used >= sub.monthly_quota,
    created_at: new Date().toISOString(),
    completed_at: null,
    validation_passed: null,
    validation_notes: null,
    error_message: null,
    excel_buffer: null,
  };

  db.documents.push(doc);
  saveDB(db);

  // Process synchronously (Vercel serverless)
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text } = await extractPdfText(buffer);
    const raw = await extractFinancialData(text, documentType);
    // Server-side validation — never trust AI to calculate totals
    const extracted = validateExtraction(raw);

    // Validation check
    let mismatch = false;
    for (const s of ["revenue", "expenses", "assets", "liabilities"]) {
      if (extracted[s]?.mismatch) { mismatch = true; break; }
    }
    if (extracted.mismatch) mismatch = true;

    const excelBuffer = await generateExcel(extracted);

    const dbNow = loadDB();
    const d = dbNow.documents.find((x) => x.id === docId);
    if (d) {
      d.status = "completed";
      d.completed_at = new Date().toISOString();
      d.validation_passed = !mismatch;
      d.validation_notes = extracted.validation_notes || "";
      d.excel_buffer = Array.from(excelBuffer);
    }
    const s2 = dbNow.subscriptions.find((x) => x.organization_id === payload.orgId);
    if (s2) s2.documents_used += 1;
    saveDB(dbNow);

    return NextResponse.json({ ...d, excel_buffer: undefined });
  } catch (err) {
    const dbNow = loadDB();
    const d = dbNow.documents.find((x) => x.id === docId);
    if (d) { d.status = "failed"; d.error_message = err.message; }
    saveDB(dbNow);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
