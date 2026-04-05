import pptxgen from "pptxgenjs";

const NAVY   = "1B2A4A";
const GREEN  = "3DAA5C";
const RED    = "C0392B";
const ORANGE = "E67E22";
const PURPLE = "6C3483";
const WHITE  = "FFFFFF";
const LIGHT  = "F0F4F8";
const DARK   = "2C3E50";

function fmtNum(val, currency = "EUR") {
  if (val == null) return "—";
  const syms = { EUR: "€", USD: "$", GBP: "£", MAD: "DH", CHF: "CHF", AED: "AED", AUD: "A$" };
  const sym = syms[currency] || currency;
  return `${Number(val).toLocaleString("fr-FR")} ${sym}`;
}

function fmtPct(val) {
  return val != null ? `${(val * 100).toFixed(1)}%` : "—";
}

function severityColor(s) {
  return s === "CRITICAL" ? PURPLE : s === "HIGH" ? RED : s === "MEDIUM" ? ORANGE : "95A5A6";
}

export async function generatePPTX(doc, extracted) {
  const pptx = new pptxgen();
  pptx.layout  = "LAYOUT_WIDE"; // 13.33" x 7.5"
  pptx.author  = "DataCrunch";
  pptx.company = "DataCrunch M&A Intelligence";

  const currency = extracted.currency || "EUR";
  const metrics  = extracted._metrics  || {};
  const flags    = extracted._flags    || [];
  const narrative = extracted._narrative || "";
  const scoreColor =
    doc.risk_grade === "A" ? GREEN :
    doc.risk_grade === "B" ? "2980B9" :
    doc.risk_grade === "C" ? ORANGE : RED;

  // ─────────────────────────────────────────
  // SLIDE 1 — COVER
  // ─────────────────────────────────────────
  const s1 = pptx.addSlide();
  s1.background = { color: NAVY };

  // Accent bar
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.08, h: 7.5, fill: { color: GREEN } });

  s1.addText("DataCrunch", {
    x: 0.5, y: 0.4, w: 8, h: 0.7,
    fontSize: 38, bold: true, color: GREEN, fontFace: "Calibri",
  });
  s1.addText("Rapport de Due Diligence M&A", {
    x: 0.5, y: 1.2, w: 9, h: 0.5,
    fontSize: 18, color: "AAAAAA",
  });

  s1.addShape(pptx.ShapeType.line, {
    x: 0.5, y: 1.9, w: 12, h: 0, line: { color: "334466", width: 1 },
  });

  s1.addText(extracted.company_name || "—", {
    x: 0.5, y: 2.1, w: 9, h: 0.9,
    fontSize: 32, bold: true, color: WHITE,
  });
  s1.addText(`Période: ${extracted.period || "—"}  |  Devise: ${currency}`, {
    x: 0.5, y: 3.1, w: 9, h: 0.4,
    fontSize: 14, color: "AAAAAA",
  });

  if (doc.risk_score != null) {
    s1.addShape(pptx.ShapeType.rect, {
      x: 0.5, y: 3.8, w: 3.5, h: 1.6,
      fill: { color: "0D1B2A" }, line: { color: scoreColor, width: 2 },
    });
    s1.addText("SCORE DE RISQUE", {
      x: 0.55, y: 3.9, w: 3.4, h: 0.35,
      fontSize: 9, color: "AAAAAA", align: "center",
    });
    s1.addText(`${doc.risk_score}/100`, {
      x: 0.55, y: 4.2, w: 3.4, h: 0.65,
      fontSize: 30, bold: true, color: scoreColor, align: "center",
    });
    s1.addText(`${doc.risk_grade} — ${doc.risk_label}`, {
      x: 0.55, y: 4.9, w: 3.4, h: 0.35,
      fontSize: 10, bold: true, color: scoreColor, align: "center",
    });
  }

  // Critical flags warning
  const criticals = flags.filter(f => f.severity === "CRITICAL");
  if (criticals.length > 0) {
    s1.addShape(pptx.ShapeType.rect, {
      x: 4.5, y: 3.8, w: 8.4, h: 1.4,
      fill: { color: "3D0052" }, line: { color: PURPLE, width: 1 },
    });
    s1.addText(`⚠ ${criticals.length} FLAG(S) CRITIQUE(S) DÉTECTÉ(S)`, {
      x: 4.7, y: 3.9, w: 8, h: 0.4,
      fontSize: 12, bold: true, color: "E8AAFF", align: "center",
    });
    s1.addText(criticals[0].label, {
      x: 4.7, y: 4.3, w: 8, h: 0.35,
      fontSize: 10, color: "CCAAEE", align: "center",
    });
    s1.addText("Vérification obligatoire avant toute décision", {
      x: 4.7, y: 4.7, w: 8, h: 0.3,
      fontSize: 9, italic: true, color: "AA88CC", align: "center",
    });
  }

  s1.addText(
    `Généré par DataCrunch IA — ${new Date(doc.created_at || Date.now()).toLocaleDateString("fr-FR")}`,
    { x: 0.5, y: 7.0, w: 12, h: 0.3, fontSize: 8, color: "555555", italic: true }
  );

  // ─────────────────────────────────────────
  // SLIDE 2 — KEY METRICS
  // ─────────────────────────────────────────
  const s2 = pptx.addSlide();
  s2.background = { color: LIGHT };
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.7, fill: { color: NAVY } });
  s2.addText("Indicateurs Financiers Clés", {
    x: 0.3, y: 0.1, w: 10, h: 0.5,
    fontSize: 20, bold: true, color: WHITE,
  });
  s2.addText(`${extracted.company_name || ""} — ${extracted.period || ""}`, {
    x: 0, y: 0.1, w: 13, h: 0.5,
    fontSize: 13, color: "AAAAAA", align: "right",
  });

  const kpis = [];
  if (extracted.document_type === "financial_statement") {
    kpis.push(
      { label: "Chiffre d'affaires",   val: fmtNum(metrics.revenue, currency),   sub: "" },
      { label: "EBITDA",               val: fmtNum(metrics.ebitda, currency),     sub: `Marge: ${fmtPct(metrics.ebitda_margin)}${metrics.ebitda_computed ? " (estimé)" : ""}` },
      { label: "Résultat net",         val: fmtNum(metrics.net_income, currency), sub: `Marge nette: ${fmtPct(metrics.net_margin)}` },
      { label: "Total actifs",         val: fmtNum(metrics.assets, currency),     sub: "" },
      { label: "Capitaux propres",     val: fmtNum(metrics.equity, currency),     sub: "" },
      { label: "Taux d'endettement",   val: fmtPct(metrics.debt_ratio),           sub: "" },
    );
  } else if (extracted.document_type === "revenue_list") {
    kpis.push(
      { label: "CA Total",           val: fmtNum(metrics.total_revenue, currency), sub: "" },
      { label: "Nombre de clients",  val: String(metrics.client_count ?? "—"),     sub: "" },
      { label: "Part 1er client",    val: fmtPct(metrics.top_client_pct),          sub: "Concentration" },
      { label: "Part Top 3",         val: fmtPct(metrics.top3_pct),               sub: "Concentration" },
    );
  } else if (extracted.document_type === "payroll") {
    kpis.push(
      { label: "Effectif",            val: String(metrics.employee_count ?? "—"), sub: "employés" },
      { label: "Masse salariale",     val: fmtNum(metrics.total_gross, currency), sub: "brute" },
      { label: "Salaire moyen",       val: fmtNum(metrics.avg_salary, currency),  sub: "brut" },
      { label: "Ratio max/min",       val: metrics.salary_ratio ? `${metrics.salary_ratio.toFixed(1)}x` : "—", sub: "" },
    );
  }

  kpis.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.3 + col * 4.3;
    const y = 1.0 + row * 2.2;
    s2.addShape(pptx.ShapeType.rect, {
      x, y, w: 4.0, h: 1.8,
      fill: { color: WHITE }, line: { color: "D0DAE8", width: 1 }, rectRadius: 0.05,
    });
    s2.addShape(pptx.ShapeType.rect, { x, y, w: 4.0, h: 0.08, fill: { color: GREEN } });
    s2.addText(k.label, {
      x: x + 0.15, y: y + 0.12, w: 3.7, h: 0.35,
      fontSize: 10, color: "666666",
    });
    s2.addText(k.val, {
      x: x + 0.15, y: y + 0.5, w: 3.7, h: 0.75,
      fontSize: 20, bold: true, color: NAVY,
    });
    if (k.sub) {
      s2.addText(k.sub, {
        x: x + 0.15, y: y + 1.3, w: 3.7, h: 0.3,
        fontSize: 9, color: "999999", italic: true,
      });
    }
  });

  // Risk score box
  if (doc.risk_score != null) {
    s2.addShape(pptx.ShapeType.rect, {
      x: 9.5, y: 5.3, w: 3.5, h: 1.8,
      fill: { color: NAVY }, line: { color: scoreColor, width: 2 },
    });
    s2.addText("Score de risque global", { x: 9.6, y: 5.4, w: 3.3, h: 0.35, fontSize: 9, color: "AAAAAA", align: "center" });
    s2.addText(`${doc.risk_score}/100`, { x: 9.6, y: 5.75, w: 3.3, h: 0.65, fontSize: 28, bold: true, color: scoreColor, align: "center" });
    s2.addText(`${doc.risk_grade} — ${doc.risk_label}`, { x: 9.6, y: 6.45, w: 3.3, h: 0.4, fontSize: 10, bold: true, color: scoreColor, align: "center" });
  }

  // ─────────────────────────────────────────
  // SLIDE 3 — AI NARRATIVE ANALYSIS
  // ─────────────────────────────────────────
  const s3 = pptx.addSlide();
  s3.background = { color: WHITE };
  s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.7, fill: { color: DARK } });
  s3.addText("Analyse Financière — Synthèse Expert", {
    x: 0.3, y: 0.1, w: 10, h: 0.5,
    fontSize: 20, bold: true, color: WHITE,
  });

  if (narrative) {
    // Parse sections from narrative
    const sections = narrative.split(/\*\*(.+?)\*\*/g).filter(s => s.trim());
    let y = 0.9;
    let isTitle = false;
    for (const part of sections) {
      if (y > 6.8) break;
      if (isTitle) {
        s3.addText(part.trim(), {
          x: 0.3, y, w: 12.7, h: 0.35,
          fontSize: 11, bold: true, color: DARK,
        });
        y += 0.4;
      } else if (part.trim()) {
        const lines = part.trim().split("\n").filter(l => l.trim());
        for (const line of lines) {
          if (y > 6.8) break;
          s3.addText(line.trim(), {
            x: 0.5, y, w: 12.3, h: 0.4,
            fontSize: 10, color: "333333", wrap: true,
          });
          y += 0.42;
        }
        y += 0.1;
      }
      isTitle = !isTitle;
    }
  } else {
    // Fallback: computed summary
    s3.addText("Analyse non disponible — données insuffisantes pour générer une analyse narrative.", {
      x: 0.5, y: 1.5, w: 12, h: 0.5,
      fontSize: 11, color: "999999", italic: true,
    });
  }

  s3.addShape(pptx.ShapeType.rect, {
    x: 0, y: 7.1, w: 13.33, h: 0.3,
    fill: { color: "F5F5F5" },
  });
  s3.addText("Ce rapport est généré par IA et doit être validé par un professionnel qualifié avant toute décision d'investissement.", {
    x: 0.3, y: 7.12, w: 12.7, h: 0.25,
    fontSize: 7, color: "999999", italic: true,
  });

  // ─────────────────────────────────────────
  // SLIDE 4 — RED FLAGS
  // ─────────────────────────────────────────
  const s4 = pptx.addSlide();
  s4.background = { color: WHITE };
  s4.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.7, fill: { color: RED } });
  s4.addText("Red Flags & Points de Vigilance", {
    x: 0.3, y: 0.1, w: 10, h: 0.5,
    fontSize: 20, bold: true, color: WHITE,
  });

  if (flags.length === 0) {
    s4.addShape(pptx.ShapeType.rect, { x: 1, y: 1.5, w: 11, h: 1.5, fill: { color: "F0FFF4" }, line: { color: GREEN, width: 1 } });
    s4.addText("✓ Aucun flag détecté — Profil de risque favorable", {
      x: 1, y: 2.0, w: 11, h: 0.6,
      fontSize: 16, bold: true, color: GREEN, align: "center",
    });
  } else {
    const displayed = flags.slice(0, 6);
    displayed.forEach((f, i) => {
      const col   = i % 2;
      const row   = Math.floor(i / 2);
      const x     = 0.3 + col * 6.5;
      const y     = 0.85 + row * 2.1;
      const color = severityColor(f.severity);

      s4.addShape(pptx.ShapeType.rect, {
        x, y, w: 6.2, h: 1.9,
        fill: { color: WHITE }, line: { color, width: 1.5 }, rectRadius: 0.06,
      });
      s4.addShape(pptx.ShapeType.rect, { x, y, w: 6.2, h: 0.28, fill: { color } });
      s4.addText(`[${f.severity}]  ${f.category}`, {
        x: x + 0.1, y: y + 0.01, w: 6, h: 0.26,
        fontSize: 8, bold: true, color: WHITE,
      });
      s4.addText(f.label, {
        x: x + 0.1, y: y + 0.32, w: 6, h: 0.38,
        fontSize: 11, bold: true, color: DARK,
      });
      s4.addText(f.detail, {
        x: x + 0.1, y: y + 0.72, w: 6, h: 0.55,
        fontSize: 9, color: "555555", wrap: true,
      });
      if (f.recommendation) {
        s4.addText(`→ ${f.recommendation.slice(0, 80)}${f.recommendation.length > 80 ? "…" : ""}`, {
          x: x + 0.1, y: y + 1.3, w: 6, h: 0.45,
          fontSize: 8, italic: true, color: "2C5282", wrap: true,
        });
      }
    });

    if (flags.length > 6) {
      s4.addText(`+ ${flags.length - 6} flag(s) supplémentaire(s) — voir rapport Excel complet`, {
        x: 0.3, y: 7.05, w: 12, h: 0.3,
        fontSize: 9, color: "999999", italic: true, align: "center",
      });
    }
  }

  // ─────────────────────────────────────────
  // SLIDE 5 — FINANCIAL DETAIL
  // ─────────────────────────────────────────
  const s5 = pptx.addSlide();
  s5.background = { color: WHITE };
  s5.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.7, fill: { color: NAVY } });
  s5.addText("Détail Financier", {
    x: 0.3, y: 0.1, w: 10, h: 0.5,
    fontSize: 20, bold: true, color: WHITE,
  });

  if (extracted.document_type === "financial_statement") {
    // Revenue table (left)
    const revItems = (extracted.revenue?.items || []).slice(0, 9);
    if (revItems.length > 0) {
      s5.addTable(
        [
          [
            { text: "Revenus", options: { bold: true, color: WHITE, fill: GREEN, fontSize: 9 } },
            { text: "Montant", options: { bold: true, color: WHITE, fill: GREEN, align: "right", fontSize: 9 } },
          ],
          ...revItems.map(item => [
            { text: item.label || "—", options: { fontSize: 9 } },
            { text: fmtNum(item.amount, currency), options: { align: "right", fontSize: 9 } },
          ]),
          [
            { text: "TOTAL", options: { bold: true, fontSize: 9 } },
            { text: fmtNum(extracted.revenue?.total_stated, currency), options: { bold: true, align: "right", fontSize: 9 } },
          ],
        ],
        { x: 0.3, y: 0.85, w: 6.0, colW: [4.0, 2.0] }
      );
    }

    // Expenses table (right)
    const expItems = (extracted.expenses?.items || []).slice(0, 9);
    if (expItems.length > 0) {
      s5.addTable(
        [
          [
            { text: "Charges", options: { bold: true, color: WHITE, fill: RED, fontSize: 9 } },
            { text: "Montant", options: { bold: true, color: WHITE, fill: RED, align: "right", fontSize: 9 } },
          ],
          ...expItems.map(item => [
            { text: item.label || "—", options: { fontSize: 9 } },
            { text: fmtNum(item.amount, currency), options: { align: "right", fontSize: 9 } },
          ]),
          [
            { text: "TOTAL", options: { bold: true, fontSize: 9 } },
            { text: fmtNum(extracted.expenses?.total_stated, currency), options: { bold: true, align: "right", fontSize: 9 } },
          ],
        ],
        { x: 6.8, y: 0.85, w: 6.2, colW: [4.2, 2.0] }
      );
    }

  } else if (extracted.document_type === "revenue_list") {
    const clients = (extracted.clients || []).slice(0, 12);
    if (clients.length > 0) {
      s5.addTable(
        [
          [
            { text: "Client",   options: { bold: true, color: WHITE, fill: NAVY, fontSize: 9 } },
            { text: "CA",       options: { bold: true, color: WHITE, fill: NAVY, align: "right", fontSize: 9 } },
            { text: "%",        options: { bold: true, color: WHITE, fill: NAVY, align: "right", fontSize: 9 } },
          ],
          ...clients.map(c => [
            { text: c.name || "—" },
            { text: fmtNum(c.revenue, currency), options: { align: "right" } },
            { text: `${(c.percentage || 0).toFixed(1)}%`, options: { align: "right" } },
          ]),
        ],
        { x: 0.3, y: 0.85, w: 12.7, colW: [7.5, 3.2, 2.0], fontSize: 9 }
      );
    }
  } else if (extracted.document_type === "payroll") {
    const emps = (extracted.employees || []).slice(0, 12);
    if (emps.length > 0) {
      s5.addTable(
        [
          [
            { text: "Nom",    options: { bold: true, color: WHITE, fill: NAVY, fontSize: 9 } },
            { text: "Poste",  options: { bold: true, color: WHITE, fill: NAVY, fontSize: 9 } },
            { text: "Brut",   options: { bold: true, color: WHITE, fill: NAVY, align: "right", fontSize: 9 } },
            { text: "Net",    options: { bold: true, color: WHITE, fill: NAVY, align: "right", fontSize: 9 } },
          ],
          ...emps.map(e => [
            { text: e.name || "—" },
            { text: e.role || "—" },
            { text: fmtNum(e.gross_salary, currency), options: { align: "right" } },
            { text: fmtNum(e.net_salary,   currency), options: { align: "right" } },
          ]),
        ],
        { x: 0.3, y: 0.85, w: 12.7, colW: [3.5, 3.5, 2.8, 2.9], fontSize: 9 }
      );
    }
  }

  s5.addText(
    "DISCLAIMER: Rapport généré automatiquement par DataCrunch IA. Données à vérifier par un professionnel avant toute décision.",
    { x: 0.3, y: 7.1, w: 12.7, h: 0.25, fontSize: 7, color: "AAAAAA", italic: true }
  );

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(buffer);
}
