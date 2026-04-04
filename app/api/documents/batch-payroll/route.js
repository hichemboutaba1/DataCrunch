import { NextResponse } from "next/server";
import { loadDB, saveDB, nextId } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { extractPdfText } from "@/lib/pdf";
import { extractPayslip } from "@/lib/ai";
import { validateExtraction } from "@/lib/validate";
import { generateExcel } from "@/lib/excel";
import { analyzeRedFlags } from "@/lib/redflags";

// POST: accepts multiple PDF files as FormData, combines into one payroll Excel
export async function POST(request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const files = formData.getAll("files[]"); // multiple files (FormData key is "files[]")
  const period = formData.get("period") || null;
  const company = formData.get("company") || null;

  if (!files?.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });
  if (files.length > 50) return NextResponse.json({ error: "Maximum 50 files per batch" }, { status: 400 });

  const db = await loadDB();
  const sub = db.subscriptions.find(s => s.organization_id === payload.orgId);
  if (!sub || !["active", "trialing"].includes(sub.status)) {
    return NextResponse.json({ error: "No active subscription" }, { status: 402 });
  }

  // Process each PDF
  const allEmployees = [];
  const errors = [];
  let detectedCompany = company;
  let detectedPeriod = period;
  let detectedCurrency = null;

  for (const file of files) {
    if (!file.name?.endsWith(".pdf")) continue;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { text } = await extractPdfText(buffer);
      if (text.trim().length < 30) { errors.push(`${file.name}: no text extracted`); continue; }

      const raw = await extractPayslip(text);
      if (!detectedCompany && raw.company_name) detectedCompany = raw.company_name;
      if (!detectedPeriod && raw.period) detectedPeriod = raw.period;
      if (!detectedCurrency && raw.currency) detectedCurrency = raw.currency;

      if (raw.employees?.length) {
        for (const emp of raw.employees) {
          allEmployees.push({ ...emp, _source: file.name });
        }
      } else {
        errors.push(`${file.name}: no employee data found`);
      }
    } catch (e) {
      errors.push(`${file.name}: ${e.message}`);
    }
  }

  if (allEmployees.length === 0) {
    return NextResponse.json({
      error: "No employee data extracted from any file",
      details: errors,
    }, { status: 422 });
  }

  // Build a combined payroll extracted object
  const combined = {
    document_type: "payroll",
    company_name: detectedCompany || "N/A",
    period: detectedPeriod || period || "N/A",
    currency: detectedCurrency || "EUR",
    employees: allEmployees,
    total_gross_stated: null,
    _batch: true,
    _file_count: files.length,
    _errors: errors,
  };

  const extracted = validateExtraction(combined);
  const rfResult = analyzeRedFlags(extracted);
  extracted._risk = rfResult;
  extracted._text_preview = `Batch of ${files.length} payslip(s). Errors: ${errors.length > 0 ? errors.join("; ") : "none"}`;

  const excelBuffer = await generateExcel(extracted);

  // Reload fresh DB before writing — the AI loop above can take 30-60s,
  // another user may have written to the DB in the meantime
  const dbNow = await loadDB();
  const docId = nextId(dbNow);
  const doc = {
    id: docId,
    organization_id: payload.orgId,
    user_id: payload.userId,
    filename: `Batch_Payroll_${files.length}_files.pdf`,
    document_type: "payroll",
    status: "completed",
    is_overage: sub.documents_used >= sub.monthly_quota,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    validation_passed: !extracted.mismatch,
    validation_notes: extracted.validation_notes,
    error_message: errors.length ? errors.join("; ") : null,
    excel_buffer: Array.from(excelBuffer),
    extracted_data: extracted,
    risk_grade: rfResult.grade,
    risk_score: rfResult.riskScore,
    risk_label: rfResult.gradeLabel,
    red_flags_count: rfResult.flags.length,
  };

  dbNow.documents.push(doc);
  const s = dbNow.subscriptions.find(x => x.organization_id === payload.orgId);
  if (s) s.documents_used += 1;
  await saveDB(dbNow);

  const { excel_buffer: _e, extracted_data: _x, ...rest } = doc;
  return NextResponse.json({ ...rest, employees_extracted: allEmployees.length, errors });
}
