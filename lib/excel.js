import ExcelJS from "exceljs";

const NAVY = "FF1B2A4A";
const GREEN = "FF3DAA5C";
const RED = "FFC0392B";
const ORANGE = "FFE67E22";
const WHITE = "FFFFFFFF";
const LIGHT_BG = "FFF0F4F8";

function currencyFormat(currency) {
  const formats = {
    EUR: '#,##0.00 "€"',
    USD: '"$"#,##0.00',
    GBP: '"£"#,##0.00',
    MAD: '#,##0.00 "DH"',
    CHF: '"CHF" #,##0.00',
  };
  return formats[currency] || '#,##0.00';
}

function headerStyle(color = NAVY) {
  return {
    font: { bold: true, color: { argb: WHITE }, size: 11 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: color } },
    alignment: { horizontal: "center", vertical: "middle" },
    border: {
      bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
    },
  };
}

function addHeaderRow(sheet, headers, color = NAVY) {
  const row = sheet.addRow(headers);
  row.eachCell((cell) => Object.assign(cell, headerStyle(color)));
  row.height = 20;
}

export async function generateExcel(doc, extracted) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DataCrunch";
  wb.created = new Date();

  const currency = extracted.currency || "EUR";
  const numFmt = currencyFormat(currency);

  // === Sheet 1: Executive Summary ===
  const summary = wb.addWorksheet("Executive Summary");
  summary.columns = [
    { key: "label", width: 30 },
    { key: "value", width: 25 },
  ];

  // Title
  const titleRow = summary.addRow(["DataCrunch — Rapport de Due Diligence"]);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: WHITE } };
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  summary.mergeCells(`A1:B1`);
  titleRow.height = 30;

  summary.addRow([]);
  summary.addRow(["Entreprise", extracted.company_name || "—"]);
  summary.addRow(["Période", extracted.period || "—"]);
  summary.addRow(["Devise", currency]);
  summary.addRow(["Type de document", doc.document_type]);
  summary.addRow(["Date d'analyse", new Date(doc.created_at).toLocaleDateString("fr-FR")]);
  summary.addRow([]);

  if (doc.risk_grade) {
    const gradeRow = summary.addRow(["Note de risque", `${doc.risk_grade} — ${doc.risk_label}`]);
    const gradeColor = doc.risk_grade === "A" ? GREEN : doc.risk_grade === "D" ? RED : ORANGE;
    gradeRow.getCell(2).font = { bold: true, color: { argb: gradeColor } };
  }

  if (extracted.document_type === "financial_statement") {
    summary.addRow([]);
    addHeaderRow(summary, ["Indicateur", "Valeur"], NAVY);
    const kpis = [
      ["Chiffre d'affaires", extracted.revenue?.total_stated],
      ["Total charges", extracted.expenses?.total_stated],
      ["EBITDA", extracted.ebitda],
      ["Résultat net", extracted.net_income],
      ["Total actifs", extracted.assets?.total_stated],
      ["Total passifs", extracted.liabilities?.total_stated],
    ];
    for (const [label, val] of kpis) {
      const row = summary.addRow([label, val ?? "—"]);
      if (typeof val === "number") row.getCell(2).numFmt = numFmt;
    }
  } else if (extracted.document_type === "revenue_list") {
    summary.addRow([]);
    addHeaderRow(summary, ["Indicateur", "Valeur"], NAVY);
    summary.addRow(["Nombre de clients", (extracted.clients || []).length]);
    const totalRow = summary.addRow(["CA Total déclaré", extracted.total_stated ?? "—"]);
    if (typeof extracted.total_stated === "number") totalRow.getCell(2).numFmt = numFmt;
  } else if (extracted.document_type === "payroll") {
    summary.addRow([]);
    addHeaderRow(summary, ["Indicateur", "Valeur"], NAVY);
    summary.addRow(["Nombre d'employés", (extracted.employees || []).length]);
    const massRow = summary.addRow(["Masse salariale brute", extracted.total_gross_stated ?? "—"]);
    if (typeof extracted.total_gross_stated === "number") massRow.getCell(2).numFmt = numFmt;
  }

  // Validation
  if (doc.validation_notes) {
    summary.addRow([]);
    summary.addRow(["Validation", doc.validation_passed ? "✓ Passée" : "⚠ Écarts détectés"]);
    summary.addRow(["Détails validation", doc.validation_notes]);
  }

  // === Sheet 2: Financial Detail / Revenue / Payroll ===
  if (extracted.document_type === "financial_statement") {
    const detail = wb.addWorksheet("Détail Financier");
    detail.columns = [
      { key: "label", width: 35 },
      { key: "amount", width: 20 },
    ];

    // Revenue
    addHeaderRow(detail, ["Poste de revenus", "Montant"], GREEN);
    for (const item of extracted.revenue?.items || []) {
      const row = detail.addRow([item.label, item.amount]);
      if (typeof item.amount === "number") row.getCell(2).numFmt = numFmt;
    }
    const revTotal = detail.addRow(["TOTAL REVENUS", extracted.revenue?.total_stated]);
    revTotal.font = { bold: true };
    if (typeof extracted.revenue?.total_stated === "number") revTotal.getCell(2).numFmt = numFmt;
    detail.addRow([]);

    // Expenses
    addHeaderRow(detail, ["Poste de charges", "Montant"], RED);
    for (const item of extracted.expenses?.items || []) {
      const row = detail.addRow([item.label, item.amount]);
      if (typeof item.amount === "number") row.getCell(2).numFmt = numFmt;
    }
    const expTotal = detail.addRow(["TOTAL CHARGES", extracted.expenses?.total_stated]);
    expTotal.font = { bold: true };
    if (typeof extracted.expenses?.total_stated === "number") expTotal.getCell(2).numFmt = numFmt;
    detail.addRow([]);

    // EBITDA / Net Income
    addHeaderRow(detail, ["Résultats", "Montant"], NAVY);
    const ebitdaRow = detail.addRow(["EBITDA", extracted.ebitda]);
    if (typeof extracted.ebitda === "number") ebitdaRow.getCell(2).numFmt = numFmt;
    const netRow = detail.addRow(["Résultat net", extracted.net_income]);
    if (typeof extracted.net_income === "number") netRow.getCell(2).numFmt = numFmt;
    detail.addRow([]);

    // Assets
    addHeaderRow(detail, ["Actifs", "Montant"], NAVY);
    for (const item of extracted.assets?.items || []) {
      const row = detail.addRow([item.label, item.amount]);
      if (typeof item.amount === "number") row.getCell(2).numFmt = numFmt;
    }
    const assetTotal = detail.addRow(["TOTAL ACTIFS", extracted.assets?.total_stated]);
    assetTotal.font = { bold: true };
    if (typeof extracted.assets?.total_stated === "number") assetTotal.getCell(2).numFmt = numFmt;
    detail.addRow([]);

    // Liabilities
    addHeaderRow(detail, ["Passifs", "Montant"], RED);
    for (const item of extracted.liabilities?.items || []) {
      const row = detail.addRow([item.label, item.amount]);
      if (typeof item.amount === "number") row.getCell(2).numFmt = numFmt;
    }
    const liabTotal = detail.addRow(["TOTAL PASSIFS", extracted.liabilities?.total_stated]);
    liabTotal.font = { bold: true };
    if (typeof extracted.liabilities?.total_stated === "number") liabTotal.getCell(2).numFmt = numFmt;

  } else if (extracted.document_type === "revenue_list") {
    const revSheet = wb.addWorksheet("Répartition CA");
    revSheet.columns = [
      { key: "name", width: 35 },
      { key: "revenue", width: 20 },
      { key: "pct", width: 15 },
    ];
    addHeaderRow(revSheet, ["Client", "CA", "% du total"], NAVY);
    for (const client of extracted.clients || []) {
      const row = revSheet.addRow([client.name, client.revenue, client.percentage / 100]);
      if (typeof client.revenue === "number") row.getCell(2).numFmt = numFmt;
      row.getCell(3).numFmt = "0.0%";
    }
    const totalRow = revSheet.addRow(["TOTAL", extracted.total_stated, 1]);
    totalRow.font = { bold: true };
    if (typeof extracted.total_stated === "number") totalRow.getCell(2).numFmt = numFmt;
    totalRow.getCell(3).numFmt = "0.0%";

  } else if (extracted.document_type === "payroll") {
    const paySheet = wb.addWorksheet("Masse Salariale");
    paySheet.columns = [
      { key: "name", width: 30 },
      { key: "role", width: 25 },
      { key: "dept", width: 20 },
      { key: "gross", width: 18 },
      { key: "net", width: 18 },
    ];
    addHeaderRow(paySheet, ["Nom", "Poste", "Département", "Salaire brut", "Salaire net"], NAVY);
    for (const emp of extracted.employees || []) {
      const row = paySheet.addRow([emp.name, emp.role, emp.department, emp.gross_salary, emp.net_salary]);
      if (typeof emp.gross_salary === "number") row.getCell(4).numFmt = numFmt;
      if (typeof emp.net_salary === "number") row.getCell(5).numFmt = numFmt;
    }
    const totalRow = paySheet.addRow(["TOTAL", "", "", extracted.total_gross_stated, ""]);
    totalRow.font = { bold: true };
    if (typeof extracted.total_gross_stated === "number") totalRow.getCell(4).numFmt = numFmt;
  }

  // === Sheet 3: Red Flags ===
  const flagSheet = wb.addWorksheet("Red Flags");
  flagSheet.columns = [
    { key: "severity", width: 12 },
    { key: "category", width: 22 },
    { key: "label", width: 35 },
    { key: "detail", width: 50 },
  ];
  addHeaderRow(flagSheet, ["Sévérité", "Catégorie", "Alerte", "Détail"], RED);
  const flags = extracted._flags || [];
  for (const flag of flags) {
    const row = flagSheet.addRow([flag.severity, flag.category, flag.label, flag.detail]);
    const color = flag.severity === "HIGH" ? RED : flag.severity === "MEDIUM" ? ORANGE : "FF95A5A6";
    row.getCell(1).font = { bold: true, color: { argb: WHITE } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  }
  if (flags.length === 0) {
    flagSheet.addRow(["—", "Aucun flag détecté", "", ""]);
  }

  // === Sheet 4: Validation Report ===
  const valSheet = wb.addWorksheet("Rapport de validation");
  valSheet.columns = [{ key: "info", width: 80 }];
  valSheet.addRow(["Rapport de validation DataCrunch"]).font = { bold: true, size: 12 };
  valSheet.addRow([`Statut: ${doc.validation_passed ? "PASSÉ" : "ÉCARTS DÉTECTÉS"}`]).font = {
    bold: true,
    color: { argb: doc.validation_passed ? GREEN : RED },
  };
  valSheet.addRow([]);
  const notes = (doc.validation_notes || "").split(" | ");
  for (const note of notes) {
    valSheet.addRow([note]);
  }
  valSheet.addRow([]);
  valSheet.addRow(["Disclaimer: Ce rapport est généré automatiquement par DataCrunch. Les données extraites doivent être vérifiées par un professionnel qualifié avant toute décision d'investissement."]);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateCompareExcel(docA, docB, extractedA, extractedB) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DataCrunch";

  const currency = extractedA.currency || extractedB.currency || "EUR";
  const numFmt = currencyFormat(currency);

  const sheet = wb.addWorksheet("Comparaison N vs N-1");
  sheet.columns = [
    { key: "metric", width: 35 },
    { key: "n1", width: 22 },
    { key: "n", width: 22 },
    { key: "delta", width: 22 },
    { key: "pct", width: 15 },
  ];

  addHeaderRow(sheet, ["Indicateur", `N-1 (${extractedA.period || ""})`, `N (${extractedB.period || ""})`, "Variation", "Δ%"], NAVY);

  function compareRow(label, valA, valB) {
    const delta = (valB ?? 0) - (valA ?? 0);
    const pct = valA ? delta / Math.abs(valA) : null;
    const row = sheet.addRow([label, valA ?? "—", valB ?? "—", delta || "—", pct]);
    if (typeof valA === "number") row.getCell(2).numFmt = numFmt;
    if (typeof valB === "number") row.getCell(3).numFmt = numFmt;
    if (typeof delta === "number") {
      row.getCell(4).numFmt = numFmt;
      row.getCell(4).font = { color: { argb: delta >= 0 ? GREEN : RED } };
    }
    if (pct !== null) {
      row.getCell(5).numFmt = "0.0%";
      row.getCell(5).font = { color: { argb: pct >= 0 ? GREEN : RED } };
    }
  }

  compareRow("Chiffre d'affaires", extractedA.revenue?.total_stated, extractedB.revenue?.total_stated);
  compareRow("Total charges", extractedA.expenses?.total_stated, extractedB.expenses?.total_stated);
  compareRow("EBITDA", extractedA.ebitda, extractedB.ebitda);
  compareRow("Résultat net", extractedA.net_income, extractedB.net_income);
  compareRow("Total actifs", extractedA.assets?.total_stated, extractedB.assets?.total_stated);
  compareRow("Total passifs", extractedA.liabilities?.total_stated, extractedB.liabilities?.total_stated);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateCombinedExcel(docs, extractedList) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DataCrunch";

  // Summary tab
  const summary = wb.addWorksheet("Résumé");
  summary.columns = [
    { key: "name", width: 30 },
    { key: "type", width: 20 },
    { key: "period", width: 15 },
    { key: "grade", width: 12 },
  ];
  addHeaderRow(summary, ["Document", "Type", "Période", "Note risque"], NAVY);
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const ex = extractedList[i];
    summary.addRow([doc.filename, doc.document_type, ex?.period || "—", doc.risk_grade || "—"]);
  }

  // One tab per document
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const ex = extractedList[i];
    if (!ex) continue;
    const currency = ex.currency || "EUR";
    const numFmt = currencyFormat(currency);
    const sheetName = doc.filename.slice(0, 28).replace(/[:/\\?*[\]]/g, "_");
    const sheet = wb.addWorksheet(sheetName);

    if (ex.document_type === "financial_statement") {
      sheet.columns = [{ key: "label", width: 35 }, { key: "amount", width: 20 }];
      addHeaderRow(sheet, ["Poste", "Montant"], NAVY);
      const rows = [
        ["CA Total", ex.revenue?.total_stated],
        ["Charges Total", ex.expenses?.total_stated],
        ["EBITDA", ex.ebitda],
        ["Résultat net", ex.net_income],
        ["Total actifs", ex.assets?.total_stated],
        ["Total passifs", ex.liabilities?.total_stated],
      ];
      for (const [label, val] of rows) {
        const row = sheet.addRow([label, val ?? "—"]);
        if (typeof val === "number") row.getCell(2).numFmt = numFmt;
      }
    } else if (ex.document_type === "revenue_list") {
      sheet.columns = [{ key: "client", width: 35 }, { key: "rev", width: 20 }, { key: "pct", width: 12 }];
      addHeaderRow(sheet, ["Client", "CA", "%"], NAVY);
      for (const c of ex.clients || []) {
        const row = sheet.addRow([c.name, c.revenue, c.percentage / 100]);
        if (typeof c.revenue === "number") row.getCell(2).numFmt = numFmt;
        row.getCell(3).numFmt = "0.0%";
      }
    } else if (ex.document_type === "payroll") {
      sheet.columns = [
        { key: "name", width: 28 }, { key: "role", width: 22 },
        { key: "gross", width: 18 }, { key: "net", width: 18 },
      ];
      addHeaderRow(sheet, ["Nom", "Poste", "Brut", "Net"], NAVY);
      for (const e of ex.employees || []) {
        const row = sheet.addRow([e.name, e.role, e.gross_salary, e.net_salary]);
        if (typeof e.gross_salary === "number") row.getCell(3).numFmt = numFmt;
        if (typeof e.net_salary === "number") row.getCell(4).numFmt = numFmt;
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
