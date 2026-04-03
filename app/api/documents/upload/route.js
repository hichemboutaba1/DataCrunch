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
    extracted_data: null,  // stores full extracted JSON for preview & PPT
  };

  db.documents.push(doc);
  saveDB(db);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, pages } = await extractPdfText(buffer);

    // Detect scanned / image-based PDFs
    const textLen = text.trim().length;
    if (textLen < 80) {
      throw new Error(
        `PDF has no extractable text (${textLen} chars). This PDF may be a scanned image — please use a text-based PDF or run OCR first.`
      );
    }

    const raw = await extractFinancialData(text, documentType);
    const extracted = validateExtraction(raw);

    // Store a text preview for debugging (first 800 chars)
    extracted._text_preview = text.slice(0, 800);

    // Warn if AI returned empty data (likely unsupported format)
    const isEmpty = (
      (documentType === "payroll" && !(extracted.employees?.length)) ||
      (documentType === "revenue_list" && !(extracted.clients?.length)) ||
      (documentType === "financial_statement" && !extracted.revenue?.items?.length && !extracted.expenses?.items?.length)
    );
    if (isEmpty) {
      extracted.validation_notes = `⚠️ No data extracted — PDF text length: ${textLen} chars. Check Validation Report tab for raw text preview.`;
    }

    // Check for any mismatch
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
      d.extracted_data = extracted;  // full JSON for preview & PPT export
      d.pages = pages;
    }
    const s2 = dbNow.subscriptions.find((x) => x.organization_id === payload.orgId);
    if (s2) s2.documents_used += 1;
    saveDB(dbNow);

    // Return doc without heavy buffers
    const { excel_buffer: _e, extracted_data: _x, ...rest } = d;
    return NextResponse.json(rest);
  } catch (err) {
    const dbNow = loadDB();
    const d = dbNow.documents.find((x) => x.id === docId);
    if (d) { d.status = "failed"; d.error_message = err.message; }
    saveDB(dbNow);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
