import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
} from "docx";

const NAVY = "1B2A4A";
const GREEN = "3DAA5C";
const RED = "C0392B";
const ORANGE = "E67E22";

function fmtNum(val, currency = "EUR") {
  if (val == null) return "—";
  const symbols = { EUR: "€", USD: "$", GBP: "£", MAD: "DH", CHF: "CHF" };
  return `${symbols[currency] || ""}${Number(val).toLocaleString("fr-FR")}`;
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 300, after: 150 },
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 100 },
  });
}

function tableRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells.map(
      (text) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: String(text ?? "—"), bold: isHeader, color: isHeader ? "FFFFFF" : undefined })],
              alignment: AlignmentType.LEFT,
            }),
          ],
          shading: isHeader
            ? { val: ShadingType.CLEAR, color: "auto", fill: NAVY }
            : undefined,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
        })
    ),
  });
}

function buildTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [tableRow(headers, true), ...rows.map((r) => tableRow(r))],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
      insideH: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
      insideV: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
    },
  });
}

export async function generateDOCX(doc, extracted) {
  const currency = extracted.currency || "EUR";
  const flags = extracted._flags || [];
  const children = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "DataCrunch — Rapport de Due Diligence M&A", bold: true, size: 48, color: NAVY }),
      ],
      spacing: { after: 200 },
    })
  );

  children.push(para(`Entreprise: ${extracted.company_name || "—"}`, { bold: true, size: 28 }));
  children.push(para(`Période: ${extracted.period || "—"}`));
  children.push(para(`Devise: ${currency}`));
  children.push(para(`Type: ${doc.document_type}`));
  children.push(para(`Date d'analyse: ${new Date(doc.created_at).toLocaleDateString("fr-FR")}`));

  if (doc.risk_grade) {
    const gradeColor = doc.risk_grade === "A" ? GREEN : doc.risk_grade === "D" ? RED : ORANGE;
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Note de risque: ${doc.risk_grade} — ${doc.risk_label}`,
            bold: true,
            color: gradeColor,
            size: 28,
          }),
        ],
        spacing: { before: 200, after: 200 },
      })
    );
  }

  // Financial detail
  children.push(heading("Données Financières"));

  if (extracted.document_type === "financial_statement") {
    children.push(heading("Revenus", HeadingLevel.HEADING_2));
    children.push(
      buildTable(
        ["Poste", "Montant"],
        [
          ...(extracted.revenue?.items || []).map((i) => [i.label, fmtNum(i.amount, currency)]),
          ["TOTAL REVENUS", fmtNum(extracted.revenue?.total_stated, currency)],
        ]
      )
    );
    children.push(new Paragraph({ text: "", spacing: { after: 150 } }));

    children.push(heading("Charges", HeadingLevel.HEADING_2));
    children.push(
      buildTable(
        ["Poste", "Montant"],
        [
          ...(extracted.expenses?.items || []).map((i) => [i.label, fmtNum(i.amount, currency)]),
          ["TOTAL CHARGES", fmtNum(extracted.expenses?.total_stated, currency)],
        ]
      )
    );
    children.push(new Paragraph({ text: "", spacing: { after: 150 } }));

    children.push(heading("Résultats", HeadingLevel.HEADING_2));
    children.push(
      buildTable(
        ["Indicateur", "Valeur"],
        [
          ["EBITDA", fmtNum(extracted.ebitda, currency)],
          ["Résultat net", fmtNum(extracted.net_income, currency)],
        ]
      )
    );
    children.push(new Paragraph({ text: "", spacing: { after: 150 } }));

    children.push(heading("Bilan", HeadingLevel.HEADING_2));
    children.push(
      buildTable(
        ["Actif", "Montant"],
        [
          ...(extracted.assets?.items || []).map((i) => [i.label, fmtNum(i.amount, currency)]),
          ["TOTAL ACTIFS", fmtNum(extracted.assets?.total_stated, currency)],
        ]
      )
    );
    children.push(new Paragraph({ text: "", spacing: { after: 150 } }));
    children.push(
      buildTable(
        ["Passif", "Montant"],
        [
          ...(extracted.liabilities?.items || []).map((i) => [i.label, fmtNum(i.amount, currency)]),
          ["TOTAL PASSIFS", fmtNum(extracted.liabilities?.total_stated, currency)],
        ]
      )
    );
  } else if (extracted.document_type === "revenue_list") {
    children.push(
      buildTable(
        ["Client", "CA", "%"],
        [
          ...(extracted.clients || []).map((c) => [
            c.name,
            fmtNum(c.revenue, currency),
            `${c.percentage?.toFixed(1) || "—"}%`,
          ]),
          ["TOTAL", fmtNum(extracted.total_stated, currency), "100%"],
        ]
      )
    );
  } else if (extracted.document_type === "payroll") {
    children.push(
      buildTable(
        ["Nom", "Poste", "Département", "Brut", "Net"],
        [
          ...(extracted.employees || []).map((e) => [
            e.name,
            e.role,
            e.department,
            fmtNum(e.gross_salary, currency),
            fmtNum(e.net_salary, currency),
          ]),
          ["TOTAL", "", "", fmtNum(extracted.total_gross_stated, currency), ""],
        ]
      )
    );
  }

  // Red Flags
  children.push(heading("Analyse des Risques"));
  if (flags.length === 0) {
    children.push(para("Aucun flag détecté — Profil de risque faible.", { color: GREEN }));
  } else {
    children.push(
      buildTable(
        ["Sévérité", "Catégorie", "Alerte", "Détail"],
        flags.map((f) => [f.severity, f.category, f.label, f.detail])
      )
    );
  }

  // Validation
  children.push(heading("Rapport de Validation"));
  children.push(
    para(`Statut: ${doc.validation_passed ? "PASSÉ" : "ÉCARTS DÉTECTÉS"}`, {
      bold: true,
      color: doc.validation_passed ? GREEN : RED,
    })
  );
  for (const note of (doc.validation_notes || "").split(" | ")) {
    if (note.trim()) children.push(para(`• ${note}`));
  }

  // Disclaimer
  children.push(new Paragraph({ text: "", spacing: { before: 400 } }));
  children.push(
    para(
      "Disclaimer: Ce rapport est généré automatiquement par DataCrunch à des fins d'aide à la décision. Les informations extraites doivent être vérifiées par un professionnel qualifié avant toute décision d'investissement.",
      { italic: true, color: "888888", size: 18 }
    )
  );

  const docObj = new Document({ sections: [{ children }] });
  return Packer.toBuffer(docObj);
}
