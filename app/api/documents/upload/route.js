import { NextResponse } from "next/server";
import { loadDB, saveDB, nextId } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { extractPdfText } from "@/lib/pdf";
import { extractFinancialData } from "@/lib/ai";
import { validateExtraction } from "@/lib/validate";
import { analyzeRedFlags } from "@/lib/redflags";
import { ocrPdf } from "@/lib/ocr";

// Allow up to 60s — PDF extraction + AI + OCR + Excel can take ~30-45s on scanned files
export const maxDuration = 60;

export async function POST(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const documentType = formData.get("document_type") || "financial_statement";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.name.endsWith(".pdf")) return NextResponse.json({ error: "Only PDF files accepted" }, { status: 400 });

  const db = await loadDB();
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
    extracted_data: null,
  };

  db.documents.push(doc);
  await saveDB(db);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let { text, pages } = await extractPdfText(buffer);

    const textLen = text.trim().length;
    let usedOcr = false;

    // Scanned / image-based PDF — fall back to Mistral OCR if key is configured
    if (textLen < 80) {
      if (!process.env.MISTRAL_API_KEY) {
        throw new Error(
          `PDF has no extractable text (${textLen} chars). This PDF appears to be a scanned image. Please upload a text-based PDF or configure MISTRAL_API_KEY to enable automatic OCR.`
        );
      }
      text = await ocrPdf(buffer);
      usedOcr = true;
      if (text.trim().length < 20) {
        throw new Error("OCR could not extract any text from this PDF. The document may be a blank scan or have very low quality.");
      }
    }

    const raw = await extractFinancialData(text, documentType);
    const extracted = validateExtraction(raw);

    extracted._text_preview = (usedOcr ? "[OCR] " : "") + text.slice(0, 800);

    const isEmpty = (
      (documentType === "payroll" && !(extracted.employees?.length)) ||
      (documentType === "revenue_list" && !(extracted.clients?.length)) ||
      (documentType === "financial_statement" && !extracted.revenue?.items?.length && !extracted.expenses?.items?.length)
    );
    if (isEmpty) {
      extracted.validation_notes = `⚠️ No data extracted — PDF text length: ${textLen} chars. Check Validation Report tab for raw text preview.`;
    }

    let mismatch = false;
    for (const s of ["revenue", "expenses", "assets", "liabilities"]) {
      if (extracted[s]?.mismatch) { mismatch = true; break; }
    }
    if (extracted.mismatch) mismatch = true;

    const rfResult = analyzeRedFlags(extracted);
    extracted._risk = rfResult;

    // Excel is generated on-demand at download time — don't store binary in DB
    // (would exceed Upstash 1MB limit as a JSON number array)

    // Update the document in the already-loaded db — avoids a second Upstash round-trip
    const d = db.documents.find((x) => x.id === docId);
    if (d) {
      d.status = "completed";
      d.completed_at = new Date().toISOString();
      d.validation_passed = !mismatch;
      d.validation_notes = extracted.validation_notes || "";
      d.extracted_data = extracted;
      d.pages = pages;
      d.risk_grade = rfResult.grade;
      d.risk_score = rfResult.riskScore;
      d.risk_label = rfResult.gradeLabel;
      d.red_flags_count = rfResult.flags.length;
    }
    const s2 = db.subscriptions.find((x) => x.organization_id === payload.orgId);
    if (s2) s2.documents_used += 1;
    await saveDB(db);

    const { excel_buffer: _e, extracted_data: _x, ...rest } = d;
    return NextResponse.json(rest);
  } catch (err) {
    console.error("Upload error:", err.message);
    const d = db.documents.find((x) => x.id === docId);
    if (d) { d.status = "failed"; d.error_message = err.message; }
    await saveDB(db);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
