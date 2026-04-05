import { NextResponse } from "next/server";
import { loadDB, saveDB, nextId } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { extractTextFromPDF } from "@/lib/pdf";
import { ocrPDF } from "@/lib/ocr";
import { extractFinancialData } from "@/lib/ai";
import { validateExtractedData } from "@/lib/validate";
import { analyzeRedFlags } from "@/lib/redflags";

export const maxDuration = 120;

export async function POST(request) {
  try {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { userId, orgId } = payload;
    const db = await loadDB();

    const sub = (db.subscriptions || []).find((s) => s.organization_id === orgId);
    if (!sub) return NextResponse.json({ error: "Aucun abonnement trouvé" }, { status: 403 });

    const formData = await request.formData();
    const files = formData.getAll("files[]");

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (sub.documents_used + 1 > sub.monthly_quota) {
      return NextResponse.json({ error: "Quota mensuel insuffisant" }, { status: 429 });
    }

    // Process each file and collect employees
    const allEmployees = [];
    let mergedCompany = "";
    let mergedPeriod = "";
    let mergedCurrency = "EUR";
    const errors = [];

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let text = "";
        try {
          const result = await extractTextFromPDF(buffer);
          text = result.text;
        } catch (e) { /* ignore */ }

        if (!text || text.trim().length < 80) {
          try { text = await ocrPDF(buffer); } catch (e) { /* ignore */ }
        }

        if (!text || text.trim().length < 20) {
          errors.push(`${file.name}: impossible d'extraire le texte`);
          continue;
        }

        const extracted = await extractFinancialData(text, "payroll");
        if (extracted.employees?.length > 0) {
          allEmployees.push(...extracted.employees);
        }
        if (!mergedCompany && extracted.company_name) mergedCompany = extracted.company_name;
        if (!mergedPeriod && extracted.period) mergedPeriod = extracted.period;
        if (extracted.currency) mergedCurrency = extracted.currency;
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    // Build merged payroll document
    const totalGross = allEmployees.reduce((sum, e) => sum + (e.gross_salary || 0), 0);
    const mergedExtracted = {
      document_type: "payroll",
      company_name: mergedCompany,
      period: mergedPeriod,
      currency: mergedCurrency,
      employees: allEmployees,
      total_gross_stated: totalGross,
    };

    const { validation_passed, validation_notes } = validateExtractedData(mergedExtracted);
    const { flags, grade, score, label } = analyzeRedFlags(mergedExtracted);
    mergedExtracted._flags = flags;

    const docId = nextId(db);
    const now = new Date().toISOString();
    const doc = {
      id: docId,
      organization_id: orgId,
      user_id: userId,
      filename: `batch-payroll-${files.length}-fichiers.pdf`,
      document_type: "payroll",
      status: "completed",
      created_at: now,
      completed_at: now,
      validation_passed,
      validation_notes,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      pages: files.length,
      risk_grade: grade,
      risk_score: score,
      risk_label: label,
      red_flags_count: flags.length,
      extracted_data: mergedExtracted,
    };

    const reloadedDb = await loadDB();
    reloadedDb.documents = [...(reloadedDb.documents || []), doc];
    const subIdx = reloadedDb.subscriptions.findIndex((s) => s.organization_id === orgId);
    if (subIdx !== -1) reloadedDb.subscriptions[subIdx].documents_used++;
    await saveDB(reloadedDb);

    const { extracted_data, ...docMeta } = doc;
    return NextResponse.json({
      document: docMeta,
      employees_merged: allEmployees.length,
      files_processed: files.length - errors.length,
      errors,
    });
  } catch (err) {
    console.error("Batch payroll error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
