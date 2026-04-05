import ExcelJS from "exceljs";

// ─── Palette ───────────────────────────────────
const NAVY   = "FF1B2A4A";
const GREEN  = "FF3DAA5C";
const RED    = "FFC0392B";
const ORANGE = "FFE67E22";
const PURPLE = "FF6C3483";
const WHITE  = "FFFFFFFF";
const LIGHT  = "FFF7FAFC";
const BORDER = "FFD0DAE8";

// ─── Helpers ───────────────────────────────────
function currencyFormat(currency) {
  const f = {
    EUR: '#,##0.00 "€"',  USD: '"$"#,##0.00',     GBP: '"£"#,##0.00',
    MAD: '#,##0.00 "DH"', CHF: '"CHF" #,##0.00',  AED: '#,##0.00 "AED"',
    AUD: '"A$"#,##0.00',  CAD: '"C$"#,##0.00',    BRL: '"R$"#,##0.00',
    JPY: '"¥"#,##0',      CNY: '"¥"#,##0.00',     INR: '"₹"#,##0.00',
    MXN: '"MX$"#,##0.00', SGD: '"S$"#,##0.00',    SEK: '#,##0.00 "kr"',
    NOK: '#,##0.00 "kr"',
  };
  return f[currency] || '#,##0.00';
}

function severityColor(s) {
  return s === "CRITICAL" ? PURPLE : s === "HIGH" ? RED : s === "ORANGE" ? ORANGE : s === "MEDIUM" ? ORANGE : "FF95A5A6";
}

function hdr(color = NAVY) {
  return {
    font: { bold: true, color: { argb: WHITE }, size: 10 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: color } },
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    border: { bottom: { style: "thin", color: { argb: BORDER } } },
  };
}

function sectionTitle(sheet, text, cols, color = NAVY) {
  const row = sheet.addRow([text]);
  sheet.mergeCells(`A${row.number}:${String.fromCharCode(64 + cols)}${row.number}`);
  row.getCell(1).font  = { bold: true, color: { argb: WHITE }, size: 11 };
  row.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  row.height = 22;
  return row;
}

function addHeaderRow(sheet, headers, color = NAVY) {
  const row = sheet.addRow(headers);
  row.eachCell((cell) => Object.assign(cell, hdr(color)));
  row.height = 20;
  return row;
}

function kpiRow(sheet, label, value, numFmt, note = "") {
  const row = sheet.addRow([label, value, note]);
  row.getCell(1).font = { size: 10, color: { argb: "FF444444" } };
  row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
  row.getCell(2).font = { bold: true, size: 11, color: { argb: NAVY } };
  if (numFmt && typeof value === "number") row.getCell(2).numFmt = numFmt;
  row.getCell(3).font = { italic: true, size: 9, color: { argb: "FF888888" } };
  return row;
}

function pctFmt(v) {
  return v != null ? `${(v * 100).toFixed(1)}%` : "—";
}

// ─── MAIN EXPORT ───────────────────────────────
export async function generateExcel(doc, extracted) {
  const wb  = new ExcelJS.Workbook();
  wb.creator = "DataCrunch";
  wb.created = new Date();

  const currency = extracted.currency || "EUR";
  const numFmt   = currencyFormat(currency);
  const metrics  = extracted._metrics  || {};
  const flags    = extracted._flags    || [];
  const narrative = extracted._narrative || "";

  // ═══════════════════════════════════════════
  // SHEET 1 — EXECUTIVE SUMMARY
  // ═══════════════════════════════════════════
  const sum = wb.addWorksheet("Executive Summary");
  sum.columns = [
    { key: "a", width: 32 },
    { key: "b", width: 28 },
    { key: "c", width: 40 },
  ];

  // ── Banner ──
  const banner = sum.addRow(["DataCrunch — Rapport de Due Diligence M&A"]);
  sum.mergeCells(`A1:C1`);
  banner.getCell(1).font  = { bold: true, size: 16, color: { argb: WHITE } };
  banner.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  banner.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  banner.height = 36;

  sum.addRow([]);

  // ── Company Info ──
  sectionTitle(sum, "INFORMATIONS GÉNÉRALES", 3);
  sum.addRow(["Entreprise",        extracted.company_name || "—", ""]);
  sum.addRow(["Période",           extracted.period       || "—", ""]);
  sum.addRow(["Devise",            currency,                       ""]);
  sum.addRow(["Type de document",  extracted.document_type,        ""]);
  sum.addRow(["Date d'analyse",    new Date(doc.created_at).toLocaleDateString("fr-FR"), ""]);

  sum.addRow([]);

  // ── Risk Score ──
  sectionTitle(sum, "SCORE DE RISQUE", 3);
  const riskRow = sum.addRow([
    "Score global",
    doc.risk_score != null ? `${doc.risk_score} / 100` : "—",
    doc.risk_label || "",
  ]);
  riskRow.getCell(1).font = { bold: true, size: 10, color: { argb: "FF444444" } };
  riskRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
  const scoreColor =
    doc.risk_grade === "A" ? GREEN :
    doc.risk_grade === "B" ? "FF2980B9" :
    doc.risk_grade === "C" ? ORANGE : RED;
  riskRow.getCell(2).font = { bold: true, size: 16, color: { argb: scoreColor } };
  riskRow.getCell(3).font = { bold: true, size: 10, color: { argb: scoreColor } };
  riskRow.height = 26;

  const gradeRow = sum.addRow(["Note de risque", doc.risk_grade || "—", ""]);
  gradeRow.getCell(2).font = { bold: true, size: 20, color: { argb: scoreColor } };
  gradeRow.height = 28;

  if (flags.some(f => f.severity === "CRITICAL")) {
    const critRow = sum.addRow(["⚠ FLAGS CRITIQUES DÉTECTÉS", `${flags.filter(f=>f.severity==="CRITICAL").length} anomalie(s) — données à vérifier`, ""]);
    critRow.getCell(1).font = { bold: true, color: { argb: WHITE } };
    critRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
    critRow.getCell(2).font = { bold: true, color: { argb: WHITE } };
    critRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
    sum.mergeCells(`A${critRow.number}:C${critRow.number}`);
    critRow.getCell(1).alignment = { horizontal: "center" };
  }

  // ── Score Breakdown ──
  if (metrics.equity !== undefined || doc.risk_score != null) {
    sum.addRow([]);
    sectionTitle(sum, "DÉCOMPOSITION DU SCORE", 3);
    addHeaderRow(sum, ["Dimension", "Score", "Commentaire"], "FF2C3E50");
    const bd = metrics._score_breakdown || {};
    const dims = [
      ["Fiabilité des données",  bd.reliability,    "Cohérence et complétude du document"],
      ["Rentabilité",            bd.profitability,   "Marges opérationnelles et nettes"],
      ["Cohérence financière",   bd.consistency,     "Équilibre bilan et calculs"],
      ["Niveau d'endettement",   bd.debt,            "Structure de financement"],
    ];
    for (const [dim, val, comment] of dims) {
      if (val == null) continue;
      const row = sum.addRow([dim, `${val} pts`, comment]);
      const barColor = val >= 20 ? GREEN : val >= 10 ? ORANGE : RED;
      row.getCell(2).font = { bold: true, color: { argb: barColor } };
    }
  }

  sum.addRow([]);

  // ── Key Financial Metrics ──
  if (extracted.document_type === "financial_statement") {
    sectionTitle(sum, "INDICATEURS FINANCIERS CLÉS", 3);
    addHeaderRow(sum, ["Indicateur", "Valeur", "Note"], "FF2C3E50");
    kpiRow(sum, "Chiffre d'affaires",   metrics.revenue,     numFmt);
    kpiRow(sum, "Total charges",        metrics.expenses,    numFmt);
    kpiRow(sum, "EBITDA",               metrics.ebitda,      numFmt,  metrics.ebitda_computed ? "Estimé (CA − Charges)" : "");
    kpiRow(sum, "Marge EBITDA",         metrics.ebitda_margin != null ? metrics.ebitda_margin : null, "0.0%", pctFmt(metrics.ebitda_margin));
    kpiRow(sum, "Résultat net",         metrics.net_income,  numFmt);
    kpiRow(sum, "Marge nette",          metrics.net_margin  != null ? metrics.net_margin  : null, "0.0%", pctFmt(metrics.net_margin));
    kpiRow(sum, "Total actifs",         metrics.assets,      numFmt);
    kpiRow(sum, "Total passifs",        metrics.liabilities, numFmt);
    kpiRow(sum, "Capitaux propres",     metrics.equity,      numFmt);
    kpiRow(sum, "Taux d'endettement",   metrics.debt_ratio  != null ? metrics.debt_ratio  : null, "0.0%", pctFmt(metrics.debt_ratio));
  } else if (extracted.document_type === "revenue_list") {
    sectionTitle(sum, "INDICATEURS CLÉS", 3);
    addHeaderRow(sum, ["Indicateur", "Valeur", "Note"], "FF2C3E50");
    kpiRow(sum, "CA total",             metrics.total_revenue, numFmt);
    kpiRow(sum, "Nombre de clients",    metrics.client_count);
    kpiRow(sum, "Part 1er client",      metrics.top_client_pct != null ? metrics.top_client_pct : null, "0.0%");
    kpiRow(sum, "Concentration Top 3",  metrics.top3_pct != null ? metrics.top3_pct : null, "0.0%");
  } else if (extracted.document_type === "payroll") {
    sectionTitle(sum, "INDICATEURS CLÉS", 3);
    addHeaderRow(sum, ["Indicateur", "Valeur", "Note"], "FF2C3E50");
    kpiRow(sum, "Effectif",             metrics.employee_count);
    kpiRow(sum, "Masse salariale brute", metrics.total_gross, numFmt);
    kpiRow(sum, "Salaire moyen brut",   metrics.avg_salary,   numFmt);
    kpiRow(sum, "Ratio max/min",        metrics.salary_ratio != null ? `${metrics.salary_ratio.toFixed(1)}x` : "—");
  }

  // ── Validation ──
  if (doc.validation_notes) {
    sum.addRow([]);
    sectionTitle(sum, "VALIDATION DES DONNÉES", 3);
    const vRow = sum.addRow([
      doc.validation_passed ? "✓ Données cohérentes" : "⚠ Écarts détectés",
      doc.validation_notes,
      "",
    ]);
    vRow.getCell(1).font = { bold: true, color: { argb: doc.validation_passed ? GREEN : ORANGE } };
    vRow.getCell(2).font = { size: 9, italic: true };
    vRow.getCell(2).alignment = { wrapText: true };
    vRow.height = 40;
  }

  // ── AI Narrative ──
  if (narrative) {
    sum.addRow([]);
    sectionTitle(sum, "ANALYSE FINANCIÈRE (IA)", 3);
    // Split narrative by sections and add each as a row
    const lines = narrative.split("\n").filter(l => l.trim());
    for (const line of lines) {
      const r = sum.addRow([line, "", ""]);
      sum.mergeCells(`A${r.number}:C${r.number}`);
      r.getCell(1).font = { size: 10, color: { argb: "FF333333" } };
      r.getCell(1).alignment = { wrapText: true, vertical: "top" };
      r.height = 28;
    }
  }

  // ── Disclaimer ──
  sum.addRow([]);
  const disc = sum.addRow(["AVERTISSEMENT: Ce rapport est généré automatiquement par DataCrunch (IA). Les données extraites doivent être vérifiées par un professionnel qualifié (expert-comptable, auditeur) avant toute décision d'investissement ou transaction M&A. DataCrunch décline toute responsabilité quant à l'exactitude des données extraites.", "", ""]);
  sum.mergeCells(`A${disc.number}:C${disc.number}`);
  disc.getCell(1).font = { size: 8, italic: true, color: { argb: "FF999999" } };
  disc.getCell(1).alignment = { wrapText: true };
  disc.height = 32;

  // ═══════════════════════════════════════════
  // SHEET 2 — FINANCIAL DETAIL
  // ═══════════════════════════════════════════
  if (extracted.document_type === "financial_statement") {
    const det = wb.addWorksheet("Détail Financier");
    det.columns = [{ key: "label", width: 38 }, { key: "amount", width: 22 }];

    // Revenue
    sectionTitle(det, "COMPTE DE RÉSULTAT — REVENUS", 2, GREEN);
    addHeaderRow(det, ["Poste de revenus", "Montant"], GREEN);
    for (const item of (extracted.revenue?.items || [])) {
      const row = det.addRow([item.label, item.amount]);
      if (typeof item.amount === "number") row.getCell(2).numFmt = numFmt;
      row.getCell(2).alignment = { horizontal: "right" };
    }
    const rt = det.addRow(["TOTAL REVENUS", extracted.revenue?.total_stated]);
    rt.font = { bold: true }; rt.height = 18;
    if (typeof extracted.revenue?.total_stated === "number") {
      rt.getCell(2).numFmt = numFmt;
      rt.getCell(1).fill = rt.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F8F0" } };
    }
    det.addRow([]);

    // Expenses
    sectionTitle(det, "COMPTE DE RÉSULTAT — CHARGES", 2, RED);
    addHeaderRow(det, ["Poste de charges", "Montant"], RED);
    for (const item of (extracted.expenses?.items || [])) {
      const row = det.addRow([item.label, item.amount]);
      if (typeof item.amount === "number") row.getCell(2).numFmt = numFmt;
      row.getCell(2).alignment = { horizontal: "right" };
    }
    const et = det.addRow(["TOTAL CHARGES", extracted.expenses?.total_stated]);
    et.font = { bold: true }; et.height = 18;
    if (typeof extracted.expenses?.total_stated === "number") {
      et.getCell(2).numFmt = numFmt;
      et.getCell(1).fill = et.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
    }
    det.addRow([]);

    // EBITDA / Net
    sectionTitle(det, "RÉSULTATS", 2, NAVY);
    addHeaderRow(det, ["Indicateur", "Valeur"], NAVY);
    const eRow = det.addRow([`EBITDA${metrics.ebitda_computed ? " (estimé)" : ""}`, metrics.ebitda]);
    if (typeof metrics.ebitda === "number") eRow.getCell(2).numFmt = numFmt;
    const mRow = det.addRow([`Marge EBITDA`, metrics.ebitda_margin]);
    if (typeof metrics.ebitda_margin === "number") mRow.getCell(2).numFmt = "0.0%";
    const nRow = det.addRow(["Résultat net", metrics.net_income]);
    if (typeof metrics.net_income === "number") nRow.getCell(2).numFmt = numFmt;
    const nmRow = det.addRow(["Marge nette", metrics.net_margin]);
    if (typeof metrics.net_margin === "number") nmRow.getCell(2).numFmt = "0.0%";
    det.addRow([]);

    // Assets
    sectionTitle(det, "BILAN — ACTIFS", 2, "FF2980B9");
    addHeaderRow(det, ["Poste d'actif", "Montant"], "FF2980B9");
    for (const item of (extracted.assets?.items || [])) {
      const row = det.addRow([item.label, item.amount]);
      if (typeof item.amount === "number") row.getCell(2).numFmt = numFmt;
      row.getCell(2).alignment = { horizontal: "right" };
    }
    const at = det.addRow(["TOTAL ACTIFS", extracted.assets?.total_stated]);
    at.font = { bold: true };
    if (typeof extracted.assets?.total_stated === "number") at.getCell(2).numFmt = numFmt;
    det.addRow([]);

    // Liabilities
    sectionTitle(det, "BILAN — PASSIFS", 2, ORANGE);
    addHeaderRow(det, ["Poste de passif", "Montant"], ORANGE);
    for (const item of (extracted.liabilities?.items || [])) {
      const row = det.addRow([item.label, item.amount]);
      if (typeof item.amount === "number") row.getCell(2).numFmt = numFmt;
      row.getCell(2).alignment = { horizontal: "right" };
    }
    const lt = det.addRow(["TOTAL PASSIFS", extracted.liabilities?.total_stated]);
    lt.font = { bold: true };
    if (typeof extracted.liabilities?.total_stated === "number") lt.getCell(2).numFmt = numFmt;
    det.addRow([]);

    // Computed equity check
    if (metrics.equity != null) {
      sectionTitle(det, "CONTRÔLE BILAN", 2, "FF2C3E50");
      det.addRow(["Actif − Passif (calculé)", metrics.equity]).getCell(2).numFmt = numFmt;
      if (metrics.balance_mismatch) {
        const br = det.addRow(["⚠ DÉSÉQUILIBRE DÉTECTÉ", metrics.balance_mismatch_detail || ""]);
        br.eachCell(c => { c.font = { bold: true, color: { argb: WHITE } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } }; });
      } else {
        det.addRow(["✓ Bilan équilibré", ""]).getCell(1).font = { bold: true, color: { argb: GREEN } };
      }
    }

  } else if (extracted.document_type === "revenue_list") {
    const rev = wb.addWorksheet("Répartition CA");
    rev.columns = [{ key: "name", width: 38 }, { key: "revenue", width: 22 }, { key: "pct", width: 14 }];
    sectionTitle(rev, "RÉPARTITION DU CHIFFRE D'AFFAIRES", 3, NAVY);
    addHeaderRow(rev, ["Client", `CA (${currency})`, "% du total"]);
    const sorted = [...(extracted.clients || [])].sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
    for (const c of sorted) {
      const row = rev.addRow([c.name, c.revenue, (c.percentage || 0) / 100]);
      if (typeof c.revenue === "number") row.getCell(2).numFmt = numFmt;
      row.getCell(3).numFmt = "0.0%";
      // Color high-concentration rows
      if ((c.percentage || 0) > 30) {
        row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E1" } };
        row.getCell(3).font = { bold: true, color: { argb: ORANGE } };
      }
    }
    const tr = rev.addRow(["TOTAL", extracted.total_stated, 1]);
    tr.font = { bold: true };
    if (typeof extracted.total_stated === "number") tr.getCell(2).numFmt = numFmt;
    tr.getCell(3).numFmt = "0.0%";

  } else if (extracted.document_type === "payroll") {
    const pay = wb.addWorksheet("Masse Salariale");
    pay.columns = [
      { key: "name", width: 30 }, { key: "role", width: 26 },
      { key: "dept", width: 20 }, { key: "gross", width: 20 }, { key: "net", width: 20 },
    ];
    sectionTitle(pay, "DÉTAIL MASSE SALARIALE", 5, NAVY);
    addHeaderRow(pay, ["Nom", "Poste", "Département", "Salaire brut", "Salaire net"]);
    const sortedEmps = [...(extracted.employees || [])].sort((a, b) => (b.gross_salary || 0) - (a.gross_salary || 0));
    for (const e of sortedEmps) {
      const row = pay.addRow([e.name, e.role, e.department, e.gross_salary, e.net_salary]);
      if (typeof e.gross_salary === "number") row.getCell(4).numFmt = numFmt;
      if (typeof e.net_salary   === "number") row.getCell(5).numFmt = numFmt;
    }
    const tr = pay.addRow(["TOTAL", "", "", extracted.total_gross_stated, ""]);
    tr.font = { bold: true };
    if (typeof extracted.total_gross_stated === "number") tr.getCell(4).numFmt = numFmt;
  }

  // ═══════════════════════════════════════════
  // SHEET 3 — RED FLAGS (avec recommandations)
  // ═══════════════════════════════════════════
  const flagSheet = wb.addWorksheet("Red Flags");
  flagSheet.columns = [
    { key: "sev",   width: 12 },
    { key: "cat",   width: 22 },
    { key: "label", width: 35 },
    { key: "detail",width: 48 },
    { key: "reco",  width: 55 },
  ];

  sectionTitle(flagSheet, "ANALYSE DES RISQUES — RED FLAGS", 5, RED);
  addHeaderRow(flagSheet, ["Sévérité", "Catégorie", "Alerte", "Détail", "Recommandation"], RED);

  const sevOrder  = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sevLabel  = { CRITICAL: "⚠ CRITIQUE", HIGH: "ÉLEVÉ", MEDIUM: "MODÉRÉ", LOW: "FAIBLE" };
  const sortedFlags = [...flags].sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));

  let lastSev = null;
  for (const f of sortedFlags) {
    // Group header
    if (f.severity !== lastSev) {
      lastSev = f.severity;
      const color = severityColor(f.severity);
      const gh = flagSheet.addRow([sevLabel[f.severity] || f.severity, "", "", "", ""]);
      flagSheet.mergeCells(`A${gh.number}:E${gh.number}`);
      gh.getCell(1).font = { bold: true, color: { argb: WHITE }, size: 10 };
      gh.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      gh.getCell(1).alignment = { horizontal: "center" };
      gh.height = 18;
    }
    const row = flagSheet.addRow([f.severity, f.category, f.label, f.detail, f.recommendation || ""]);
    const color = severityColor(f.severity);
    row.getCell(1).font = { bold: true, color: { argb: WHITE }, size: 9 };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    row.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    row.getCell(5).font = { italic: true, size: 9, color: { argb: "FF2C3E50" } };
    row.eachCell(c => {
      c.alignment = { wrapText: true, vertical: "top" };
      c.border = { bottom: { style: "hair", color: { argb: BORDER } } };
    });
    row.height = 40;
  }

  if (flags.length === 0) {
    const r = flagSheet.addRow(["✓", "Aucun flag", "Profil de risque favorable", "Aucune anomalie détectée", "Poursuivre la due diligence standard"]);
    r.getCell(1).font = { bold: true, color: { argb: GREEN } };
  }

  // ═══════════════════════════════════════════
  // SHEET 4 — VALIDATION
  // ═══════════════════════════════════════════
  const val = wb.addWorksheet("Validation");
  val.columns = [{ key: "info", width: 90 }];

  sectionTitle(val, "RAPPORT DE VALIDATION AUTOMATIQUE", 1, NAVY);
  val.addRow([`Statut: ${doc.validation_passed ? "✓ DONNÉES COHÉRENTES" : "⚠ ÉCARTS DÉTECTÉS"}`])
    .getCell(1).font = { bold: true, size: 12, color: { argb: doc.validation_passed ? GREEN : ORANGE } };
  val.addRow([]);

  const notes = (doc.validation_notes || "Aucune note").split(" | ");
  for (const note of notes) {
    const r = val.addRow([note]);
    r.getCell(1).font = { size: 10 };
    r.getCell(1).alignment = { wrapText: true };
    r.height = 20;
  }

  val.addRow([]);
  const disc2 = val.addRow(["DISCLAIMER: Ce rapport de validation est généré automatiquement par DataCrunch. Les résultats doivent être confirmés par un expert-comptable ou commissaire aux comptes avant toute utilisation dans un contexte M&A ou d'audit. DataCrunch n'assume aucune responsabilité légale quant à l'exactitude ou l'exhaustivité de cette analyse."]);
  disc2.getCell(1).font = { size: 8, italic: true, color: { argb: "FF999999" } };
  disc2.getCell(1).alignment = { wrapText: true };
  disc2.height = 40;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── COMPARE EXCEL ────────────────────────────
export async function generateCompareExcel(docA, docB, extractedA, extractedB) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DataCrunch";

  const currency = extractedA.currency || extractedB.currency || "EUR";
  const numFmt   = currencyFormat(currency);
  const mA = extractedA._metrics || {};
  const mB = extractedB._metrics || {};

  const sheet = wb.addWorksheet("Comparaison N vs N-1");
  sheet.columns = [
    { key: "metric", width: 32 },
    { key: "n1",     width: 24 },
    { key: "n",      width: 24 },
    { key: "delta",  width: 24 },
    { key: "pct",    width: 14 },
  ];

  sectionTitle(sheet, "ANALYSE COMPARATIVE N vs N-1", 5, NAVY);
  addHeaderRow(sheet, [
    "Indicateur",
    `N-1  (${extractedA.period || "—"})`,
    `N  (${extractedB.period || "—"})`,
    "Variation absolue",
    "Δ%",
  ], NAVY);

  function compareRow(label, valA, valB, fmt = numFmt) {
    const delta = valA != null && valB != null ? valB - valA : null;
    const pct   = delta != null && valA != null && valA !== 0 ? delta / Math.abs(valA) : null;
    const row = sheet.addRow([label, valA ?? "—", valB ?? "—", delta ?? "—", pct]);
    if (typeof valA === "number") row.getCell(2).numFmt = fmt;
    if (typeof valB === "number") row.getCell(3).numFmt = fmt;
    if (typeof delta === "number") {
      row.getCell(4).numFmt = fmt;
      row.getCell(4).font   = { color: { argb: delta >= 0 ? GREEN : RED }, bold: true };
    }
    if (pct != null) {
      row.getCell(5).numFmt = "0.0%";
      row.getCell(5).font   = { color: { argb: pct >= 0 ? GREEN : RED } };
    }
  }

  compareRow("Chiffre d'affaires",    mA.revenue,     mB.revenue);
  compareRow("Total charges",         mA.expenses,    mB.expenses);
  compareRow("EBITDA",                mA.ebitda,      mB.ebitda);
  compareRow("Marge EBITDA",          mA.ebitda_margin, mB.ebitda_margin, "0.0%");
  compareRow("Résultat net",          mA.net_income,  mB.net_income);
  compareRow("Marge nette",           mA.net_margin,  mB.net_margin, "0.0%");
  compareRow("Total actifs",          mA.assets,      mB.assets);
  compareRow("Total passifs",         mA.liabilities, mB.liabilities);
  compareRow("Capitaux propres",      mA.equity,      mB.equity);
  compareRow("Taux d'endettement",    mA.debt_ratio,  mB.debt_ratio, "0.0%");

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── COMBINED EXCEL ───────────────────────────
export async function generateCombinedExcel(docs, extractedList) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DataCrunch";

  const sum = wb.addWorksheet("Résumé");
  sum.columns = [
    { key: "name",   width: 32 },
    { key: "type",   width: 22 },
    { key: "period", width: 16 },
    { key: "score",  width: 12 },
    { key: "grade",  width: 10 },
    { key: "flags",  width: 10 },
  ];
  sectionTitle(sum, "RAPPORT COMBINÉ — RÉSUMÉ", 6, NAVY);
  addHeaderRow(sum, ["Document", "Type", "Période", "Score", "Note", "Flags"]);
  for (let i = 0; i < docs.length; i++) {
    const d  = docs[i];
    const ex = extractedList[i];
    const scoreColor =
      d.risk_grade === "A" ? GREEN :
      d.risk_grade === "B" ? "FF2980B9" :
      d.risk_grade === "C" ? ORANGE : RED;
    const row = sum.addRow([
      d.filename,
      d.document_type,
      ex?.period || "—",
      d.risk_score != null ? `${d.risk_score}/100` : "—",
      d.risk_grade || "—",
      d.red_flags_count || 0,
    ]);
    if (d.risk_grade) {
      row.getCell(4).font = { bold: true, color: { argb: scoreColor } };
      row.getCell(5).font = { bold: true, color: { argb: scoreColor } };
    }
  }

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const ex  = extractedList[i];
    if (!ex) continue;
    const currency = ex.currency || "EUR";
    const numFmt   = currencyFormat(currency);
    const metrics  = ex._metrics || {};
    const sheetName = doc.filename.slice(0, 26).replace(/[:/\\?*[\]]/g, "_");
    const sheet = wb.addWorksheet(sheetName);

    if (ex.document_type === "financial_statement") {
      sheet.columns = [{ key: "l", width: 34 }, { key: "v", width: 22 }];
      sectionTitle(sheet, `${doc.filename} — ${ex.period || ""}`, 2, NAVY);
      addHeaderRow(sheet, ["Indicateur", "Valeur"]);
      const rows = [
        ["Chiffre d'affaires",  metrics.revenue],
        ["Total charges",       metrics.expenses],
        [`EBITDA${metrics.ebitda_computed ? " (estimé)" : ""}`, metrics.ebitda],
        ["Marge EBITDA",        metrics.ebitda_margin],
        ["Résultat net",        metrics.net_income],
        ["Total actifs",        metrics.assets],
        ["Total passifs",       metrics.liabilities],
        ["Capitaux propres",    metrics.equity],
        ["Score de risque",     doc.risk_score != null ? `${doc.risk_score}/100 (${doc.risk_grade})` : "—"],
      ];
      for (const [lbl, val] of rows) {
        const row = sheet.addRow([lbl, val ?? "—"]);
        if (typeof val === "number") {
          row.getCell(2).numFmt = lbl.includes("Marge") ? "0.0%" : numFmt;
        }
      }
    } else if (ex.document_type === "revenue_list") {
      sheet.columns = [{ key: "n", width: 36 }, { key: "r", width: 22 }, { key: "p", width: 12 }];
      sectionTitle(sheet, doc.filename, 3, NAVY);
      addHeaderRow(sheet, ["Client", "CA", "%"]);
      for (const c of (ex.clients || [])) {
        const row = sheet.addRow([c.name, c.revenue, (c.percentage || 0) / 100]);
        if (typeof c.revenue === "number") row.getCell(2).numFmt = numFmt;
        row.getCell(3).numFmt = "0.0%";
      }
    } else if (ex.document_type === "payroll") {
      sheet.columns = [
        { key: "n", width: 28 }, { key: "r", width: 22 },
        { key: "g", width: 20 }, { key: "ne", width: 20 },
      ];
      sectionTitle(sheet, doc.filename, 4, NAVY);
      addHeaderRow(sheet, ["Nom", "Poste", "Brut", "Net"]);
      for (const e of (ex.employees || [])) {
        const row = sheet.addRow([e.name, e.role, e.gross_salary, e.net_salary]);
        if (typeof e.gross_salary === "number") row.getCell(3).numFmt = numFmt;
        if (typeof e.net_salary   === "number") row.getCell(4).numFmt = numFmt;
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
