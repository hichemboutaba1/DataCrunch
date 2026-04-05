import pptxgen from "pptxgenjs";

const NAVY = "1B2A4A";
const GREEN = "3DAA5C";
const RED = "C0392B";
const ORANGE = "E67E22";
const WHITE = "FFFFFF";
const LIGHT = "F0F4F8";

function fmtNum(val, currency = "EUR") {
  if (val == null) return "—";
  const symbols = { EUR: "€", USD: "$", GBP: "£", MAD: "DH", CHF: "CHF" };
  const sym = symbols[currency] || "";
  return `${sym}${Number(val).toLocaleString("fr-FR")}`;
}

export async function generatePPTX(doc, extracted) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "DataCrunch";

  const currency = extracted.currency || "EUR";

  // Slide 1: Title
  const s1 = pptx.addSlide();
  s1.background = { color: NAVY };
  s1.addText("DataCrunch", {
    x: 0.5, y: 0.5, w: "90%", h: 0.8,
    fontSize: 36, bold: true, color: GREEN,
  });
  s1.addText("Rapport de Due Diligence M&A", {
    x: 0.5, y: 1.4, w: "90%", h: 0.5,
    fontSize: 20, color: WHITE,
  });
  s1.addText(extracted.company_name || "—", {
    x: 0.5, y: 2.2, w: "90%", h: 0.6,
    fontSize: 28, bold: true, color: WHITE,
  });
  s1.addText(`Période: ${extracted.period || "—"}  |  Devise: ${currency}`, {
    x: 0.5, y: 3.0, w: "90%", h: 0.4,
    fontSize: 14, color: "AAAAAA",
  });
  if (doc.risk_grade) {
    const gradeColor = doc.risk_grade === "A" ? GREEN : doc.risk_grade === "D" ? RED : ORANGE;
    s1.addText(`Note de risque: ${doc.risk_grade} — ${doc.risk_label}`, {
      x: 0.5, y: 3.8, w: 4, h: 0.6,
      fontSize: 16, bold: true, color: gradeColor,
      fill: { color: "1A1A2E" }, align: "center", valign: "middle",
    });
  }

  // Slide 2: KPIs
  const s2 = pptx.addSlide();
  s2.background = { color: LIGHT };
  s2.addText("Indicateurs Clés", {
    x: 0.5, y: 0.3, w: "90%", h: 0.6,
    fontSize: 24, bold: true, color: NAVY,
  });

  const kpis = [];
  if (extracted.document_type === "financial_statement") {
    kpis.push(
      { label: "Chiffre d'affaires", val: extracted.revenue?.total_stated },
      { label: "Total Charges", val: extracted.expenses?.total_stated },
      { label: "EBITDA", val: extracted.ebitda },
      { label: "Résultat net", val: extracted.net_income }
    );
  } else if (extracted.document_type === "revenue_list") {
    kpis.push(
      { label: "Nombre de clients", val: (extracted.clients || []).length },
      { label: "CA Total", val: extracted.total_stated }
    );
  } else if (extracted.document_type === "payroll") {
    kpis.push(
      { label: "Nombre d'employés", val: (extracted.employees || []).length },
      { label: "Masse salariale brute", val: extracted.total_gross_stated }
    );
  }

  kpis.forEach((kpi, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 5;
    const y = 1.2 + row * 1.8;
    s2.addShape(pptx.ShapeType.rect, {
      x, y, w: 4.5, h: 1.4,
      fill: { color: WHITE },
      line: { color: "D0D0D0", width: 1 },
      rectRadius: 0.1,
    });
    s2.addText(kpi.label, {
      x: x + 0.2, y: y + 0.1, w: 4, h: 0.4,
      fontSize: 11, color: "666666",
    });
    s2.addText(typeof kpi.val === "number" ? fmtNum(kpi.val, currency) : String(kpi.val ?? "—"), {
      x: x + 0.2, y: y + 0.5, w: 4, h: 0.6,
      fontSize: 20, bold: true, color: NAVY,
    });
  });

  // Slide 3: Financial Detail
  const s3 = pptx.addSlide();
  s3.background = { color: WHITE };
  s3.addText("Détail Financier", {
    x: 0.5, y: 0.3, w: "90%", h: 0.6,
    fontSize: 24, bold: true, color: NAVY,
  });

  if (extracted.document_type === "financial_statement") {
    const revItems = (extracted.revenue?.items || []).slice(0, 8);
    const rows = revItems.map((item) => [
      { text: item.label, options: { fontSize: 10 } },
      { text: fmtNum(item.amount, currency), options: { fontSize: 10, align: "right" } },
    ]);
    if (rows.length > 0) {
      s3.addTable(
        [
          [
            { text: "Poste de revenus", options: { bold: true, color: WHITE, fill: GREEN } },
            { text: "Montant", options: { bold: true, color: WHITE, fill: GREEN, align: "right" } },
          ],
          ...rows,
        ],
        { x: 0.5, y: 1.2, w: 4.5, colW: [3.2, 1.3], fontSize: 10 }
      );
    }
    const expItems = (extracted.expenses?.items || []).slice(0, 8);
    const expRows = expItems.map((item) => [
      { text: item.label, options: { fontSize: 10 } },
      { text: fmtNum(item.amount, currency), options: { fontSize: 10, align: "right" } },
    ]);
    if (expRows.length > 0) {
      s3.addTable(
        [
          [
            { text: "Poste de charges", options: { bold: true, color: WHITE, fill: RED } },
            { text: "Montant", options: { bold: true, color: WHITE, fill: RED, align: "right" } },
          ],
          ...expRows,
        ],
        { x: 5.5, y: 1.2, w: 4.5, colW: [3.2, 1.3], fontSize: 10 }
      );
    }
  } else if (extracted.document_type === "revenue_list") {
    const clients = (extracted.clients || []).slice(0, 10);
    const rows = clients.map((c) => [
      { text: c.name },
      { text: fmtNum(c.revenue, currency), options: { align: "right" } },
      { text: `${c.percentage?.toFixed(1) || "—"}%`, options: { align: "right" } },
    ]);
    s3.addTable(
      [
        [
          { text: "Client", options: { bold: true, color: WHITE, fill: NAVY } },
          { text: "CA", options: { bold: true, color: WHITE, fill: NAVY, align: "right" } },
          { text: "%", options: { bold: true, color: WHITE, fill: NAVY, align: "right" } },
        ],
        ...rows,
      ],
      { x: 0.5, y: 1.2, w: 9.5, colW: [5.5, 2.5, 1.5], fontSize: 10 }
    );
  }

  // Slide 4: Red Flags
  const flags = extracted._flags || [];
  const s4 = pptx.addSlide();
  s4.background = { color: WHITE };
  s4.addText("Red Flags & Risques", {
    x: 0.5, y: 0.3, w: "90%", h: 0.6,
    fontSize: 24, bold: true, color: NAVY,
  });

  if (flags.length === 0) {
    s4.addText("Aucun flag détecté — Profil de risque faible", {
      x: 0.5, y: 1.5, w: "90%", h: 0.5,
      fontSize: 16, color: GREEN, bold: true,
    });
  } else {
    flags.slice(0, 6).forEach((flag, i) => {
      const y = 1.2 + i * 0.9;
      const color = flag.severity === "HIGH" ? RED : flag.severity === "MEDIUM" ? ORANGE : "95A5A6";
      s4.addText(`[${flag.severity}] ${flag.label}`, {
        x: 0.5, y, w: 4, h: 0.35,
        fontSize: 11, bold: true, color,
      });
      s4.addText(flag.detail, {
        x: 0.5, y: y + 0.38, w: 9, h: 0.35,
        fontSize: 10, color: "444444",
      });
    });
  }

  s4.addText(
    "Ce rapport est généré automatiquement par DataCrunch et doit être validé par un professionnel qualifié.",
    { x: 0.5, y: 6.8, w: "90%", h: 0.3, fontSize: 8, color: "AAAAAA", italic: true }
  );

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(buffer);
}
