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

    // Check subscription
    const sub = (db.subscriptions || []).find((s) => s.organization_id === orgId);
    if (!sub) return NextResponse.json({ error: "Aucun abonnement trouvé" }, { status: 403 });
    if (sub.documents_used >= sub.monthly_quota) {
      return NextResponse.json({ error: `Quota mensuel atteint (${sub.monthly_quota} documents)` }, { status: 429 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const document_type = formData.get("document_type") || "financial_statement";

    if (!file) return NextResponse.json({ error: "Fichier PDF requis" }, { status: 400 });

    const validTypes = ["financial_statement", "revenue_list", "payroll"];
    if (!validTypes.includes(document_type)) {
      return NextResponse.json({ error: "Type de document invalide" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create document record
    const docId = nextId(db);
    const now = new Date().toISOString();
    const doc = {
      id: docId,
      organization_id: orgId,
      user_id: userId,
      filename: file.name,
      document_type,
      status: "processing",
      created_at: now,
      completed_at: null,
      validation_passed: null,
      validation_notes: null,
      error_message: null,
      pages: 1,
      risk_grade: null,
      risk_score: null,
      risk_label: null,
      red_flags_count: 0,
    };

    db.documents = [...(db.documents || []), doc];
    // Increment usage
    sub.documents_used = (sub.documents_used || 0) + 1;
    await saveDB(db);

    try {
      // Step 1: Extract text from PDF
      let text = "";
      let pages = 1;
      try {
        const result = await extractTextFromPDF(buffer);
        text = result.text || "";
        pages = result.pages;
      } catch (e) {
        console.warn("PDF parse failed:", e.message);
      }

      // Step 2: OCR if text insufficient (only if Mistral key is real)
      const mistralKey = process.env.MISTRAL_API_KEY || "";
      const hasRealOCR = mistralKey.length > 10 && !mistralKey.startsWith("sk-dummy");
      if (hasRealOCR && (!text || text.trim().length < 80)) {
        console.log("Text too short, using OCR...");
        try {
          const ocrText = await ocrPDF(buffer);
          if (ocrText && ocrText.trim().length > text.trim().length) {
            text = ocrText;
          }
        } catch (e) {
          console.warn("OCR failed:", e.message);
        }
      }

      // Clean text
      text = text.replace(/\x00/g, "").trim();

      if (!text || text.length < 10) {
        throw new Error(
          hasRealOCR
            ? "Impossible d'extraire le texte du PDF. Vérifiez que le fichier n'est pas corrompu."
            : "Impossible de lire ce PDF (probablement scanné). Ajoutez une clé MISTRAL_API_KEY valide pour activer l'OCR."
        );
      }

      // Step 3: AI extraction
      const extracted = await extractFinancialData(text, document_type);

      // Step 4: Validation
      const { validation_passed, validation_notes } = validateExtractedData(extracted);

      // Step 5: Red flags
      const { flags, grade, score, label } = analyzeRedFlags(extracted);

      // Attach flags to extracted for export
      extracted._flags = flags;

      // Step 6: Update document
      const reloadedDb = await loadDB();
      const docIdx = reloadedDb.documents.findIndex((d) => d.id === docId);
      if (docIdx !== -1) {
        reloadedDb.documents[docIdx] = {
          ...reloadedDb.documents[docIdx],
          status: "completed",
          completed_at: new Date().toISOString(),
          pages,
          validation_passed,
          validation_notes,
          risk_grade: grade,
          risk_score: score,
          risk_label: label,
          red_flags_count: flags.length,
          extracted_data: extracted,
        };
      }

      await saveDB(reloadedDb);

      const { extracted_data, ...docMeta } = reloadedDb.documents[docIdx] || {};
      return NextResponse.json({ document: { ...docMeta, risk_grade: grade, risk_label: label } });
    } catch (processingErr) {
      console.error("Processing error:", processingErr);
      const reloadedDb = await loadDB();
      const docIdx = reloadedDb.documents.findIndex((d) => d.id === docId);
      if (docIdx !== -1) {
        reloadedDb.documents[docIdx].status = "failed";
        reloadedDb.documents[docIdx].error_message = processingErr.message;
      }
      await saveDB(reloadedDb);
      return NextResponse.json({ error: processingErr.message }, { status: 422 });
    }
  } catch (err) {
    console.error("Upload route error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
