import Groq from "groq-sdk";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// ─────────────────────────────────────────────
// METRIC COMPUTATION
// Never modifies original extracted values.
// Only derives additional metrics.
// ─────────────────────────────────────────────
export function computeMetrics(extracted) {
  const metrics = { ebitda_computed: false };

  if (extracted.document_type === "financial_statement") {
    const revenue   = extracted.revenue?.total_stated    ?? null;
    const expenses  = extracted.expenses?.total_stated   ?? null;
    const assets    = extracted.assets?.total_stated     ?? null;
    const liabilities = extracted.liabilities?.total_stated ?? null;
    const netIncome = extracted.net_income               ?? null;

    // EBITDA — use stated value first, compute only when missing
    let ebitda = extracted.ebitda ?? null;
    if (ebitda == null && revenue != null && expenses != null) {
      ebitda = revenue - expenses;
      metrics.ebitda_computed = true;
      metrics.ebitda_note = "EBITDA estimé = CA − Charges (D&A non disponible)";
    }

    // Margin ratios (never divide by zero)
    if (revenue != null && revenue > 0) {
      if (ebitda     != null) metrics.ebitda_margin  = ebitda     / revenue;
      if (netIncome  != null) metrics.net_margin     = netIncome  / revenue;
      if (expenses   != null) metrics.expense_ratio  = expenses   / revenue;
    }

    // Balance sheet integrity
    if (assets != null && liabilities != null) {
      const computedEquity = assets - liabilities;
      metrics.equity       = computedEquity;
      metrics.debt_ratio   = assets > 0 ? liabilities / assets : null;

      // Check against stated equity if available
      const statedEquity = extracted.equity ?? null;
      if (statedEquity != null) {
        const diff      = Math.abs(computedEquity - statedEquity);
        const tolerance = Math.max(1, Math.abs(assets) * 0.005); // 0.5% tolerance
        metrics.balance_mismatch        = diff > tolerance;
        metrics.balance_mismatch_amount = diff;
        metrics.balance_mismatch_detail =
          `Actif − Passif = ${computedEquity.toLocaleString("fr-FR")} vs Capitaux propres déclarés = ${statedEquity.toLocaleString("fr-FR")} (écart: ${diff.toLocaleString("fr-FR")})`;
      } else {
        // No stated equity — just flag if A≠L with no explanation
        metrics.balance_mismatch = false;
      }
    }

    metrics.revenue     = revenue;
    metrics.expenses    = expenses;
    metrics.ebitda      = ebitda;
    metrics.net_income  = netIncome;
    metrics.assets      = assets;
    metrics.liabilities = liabilities;

  } else if (extracted.document_type === "revenue_list") {
    const clients = extracted.clients || [];
    const total   = extracted.total_stated
      ?? clients.reduce((a, c) => a + (c.revenue || 0), 0);

    metrics.total_revenue = total;
    metrics.client_count  = clients.length;

    const sorted = [...clients].sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
    if (sorted.length > 0 && total > 0) {
      metrics.top_client_pct = (sorted[0].revenue || 0) / total;
      metrics.top3_pct = sorted.slice(0, 3).reduce((a, c) => a + (c.revenue || 0), 0) / total;
    }

  } else if (extracted.document_type === "payroll") {
    const employees = extracted.employees || [];
    const salaries  = employees.map(e => e.gross_salary || 0).filter(s => s > 0);

    metrics.employee_count = employees.length;
    metrics.total_gross    = extracted.total_gross_stated
      ?? salaries.reduce((a, b) => a + b, 0);

    if (salaries.length > 0 && metrics.total_gross > 0) {
      metrics.avg_salary  = metrics.total_gross / salaries.length;
      metrics.max_salary  = Math.max(...salaries);
      metrics.min_salary  = Math.min(...salaries);
      metrics.salary_ratio = metrics.min_salary > 0
        ? metrics.max_salary / metrics.min_salary : null;
    }
  }

  return metrics;
}

// ─────────────────────────────────────────────
// RISK SCORE  0 → 100
// Breakdown: reliability + profitability + consistency + debt
// CRITICAL flags cap the score at 40.
// ─────────────────────────────────────────────
export function computeRiskScore(extracted, metrics, flags) {
  let score = 100;
  const breakdown = { reliability: 25, profitability: 35, consistency: 25, debt: 15 };

  const criticalCount = flags.filter(f => f.severity === "CRITICAL").length;
  const highCount     = flags.filter(f => f.severity === "HIGH").length;
  const mediumCount   = flags.filter(f => f.severity === "MEDIUM").length;
  const lowCount      = flags.filter(f => f.severity === "LOW").length;

  // ① Reliability — 25 pts
  const relDeduct = Math.min(25, criticalCount * 20 + highCount * 6 + mediumCount * 2 + lowCount * 0.5);
  breakdown.reliability = Math.max(0, 25 - relDeduct);
  score -= relDeduct;

  if (extracted.document_type === "financial_statement") {
    // ② Profitability — 35 pts
    let profDeduct = 0;
    const em = metrics.ebitda_margin;
    if      (em == null)   profDeduct = 8;   // unknown
    else if (em < 0)       profDeduct = 30;  // loss-making
    else if (em < 0.03)    profDeduct = 20;  // near-zero
    else if (em < 0.07)    profDeduct = 12;
    else if (em < 0.12)    profDeduct = 6;
    else if (em < 0.20)    profDeduct = 2;
    if (metrics.net_income != null && metrics.net_income < 0) profDeduct = Math.min(35, profDeduct + 5);
    breakdown.profitability = Math.max(0, 35 - profDeduct);
    score -= profDeduct;

    // ③ Consistency — 25 pts
    let conDeduct = 0;
    if (metrics.balance_mismatch)                           conDeduct += 20;
    if (metrics.revenue == null || metrics.expenses == null) conDeduct += 8;
    breakdown.consistency = Math.max(0, 25 - Math.min(25, conDeduct));
    score -= Math.min(25, conDeduct);

    // ④ Debt — 15 pts
    let debtDeduct = 0;
    if      (metrics.equity != null && metrics.equity < 0)       debtDeduct = 15;
    else if (metrics.debt_ratio != null && metrics.debt_ratio > 0.85) debtDeduct = 10;
    else if (metrics.debt_ratio != null && metrics.debt_ratio > 0.70) debtDeduct = 5;
    else if (metrics.debt_ratio != null && metrics.debt_ratio > 0.50) debtDeduct = 2;
    breakdown.debt = Math.max(0, 15 - debtDeduct);
    score -= debtDeduct;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Hard cap: any CRITICAL flag → max 40
  if (criticalCount > 0) score = Math.min(score, 40);

  const grade = score >= 75 ? "A" : score >= 55 ? "B" : score >= 35 ? "C" : "D";
  const label = score >= 75 ? "Risque faible"
              : score >= 55 ? "Risque modéré"
              : score >= 35 ? "Risque élevé"
              : "Risque critique";

  return { score, grade, label, breakdown };
}

// ─────────────────────────────────────────────
// PROFESSIONAL NARRATIVE  (Big4 / fund style)
// ─────────────────────────────────────────────
export async function generateNarrative(extracted, metrics, flags, riskResult) {
  if (!groq) return "";

  const company  = extracted.company_name || "L'entreprise";
  const period   = extracted.period || "N/A";
  const currency = extracted.currency || "EUR";
  const docType  = extracted.document_type;

  const fmt = (v) => {
    if (v == null) return "N/D";
    const syms = {
      EUR: "€", USD: "$", GBP: "£", MAD: "DH", CHF: "CHF",
      AED: "AED", AUD: "A$", CAD: "C$", BRL: "R$", JPY: "¥", CNY: "¥",
    };
    return `${Number(v).toLocaleString("fr-FR")} ${syms[currency] || currency}`;
  };
  const pct = (v) => v != null ? `${(v * 100).toFixed(1)}%` : "N/D";

  let dataCtx = "";
  if (docType === "financial_statement") {
    dataCtx = [
      `CA: ${fmt(metrics.revenue)}`,
      `Charges: ${fmt(metrics.expenses)}`,
      `EBITDA: ${fmt(metrics.ebitda)}${metrics.ebitda_computed ? " (estimé)" : ""}`,
      `Marge EBITDA: ${pct(metrics.ebitda_margin)}`,
      `Marge nette: ${pct(metrics.net_margin)}`,
      `Résultat net: ${fmt(metrics.net_income)}`,
      `Total actifs: ${fmt(metrics.assets)}`,
      `Total passifs: ${fmt(metrics.liabilities)}`,
      `Capitaux propres: ${fmt(metrics.equity)}`,
      `Taux d'endettement: ${pct(metrics.debt_ratio)}`,
    ].join("\n");
  } else if (docType === "revenue_list") {
    dataCtx = [
      `Nombre de clients: ${metrics.client_count}`,
      `CA total: ${fmt(metrics.total_revenue)}`,
      `Part du 1er client: ${pct(metrics.top_client_pct)}`,
      `Part du top 3: ${pct(metrics.top3_pct)}`,
    ].join("\n");
  } else if (docType === "payroll") {
    dataCtx = [
      `Effectif: ${metrics.employee_count} employés`,
      `Masse salariale brute: ${fmt(metrics.total_gross)}`,
      `Salaire moyen: ${fmt(metrics.avg_salary)}`,
      `Ratio max/min: ${metrics.salary_ratio?.toFixed(1) ?? "N/D"}x`,
    ].join("\n");
  }

  const flagsCtx = flags
    .slice(0, 6)
    .map(f => `[${f.severity}] ${f.label} — ${f.detail}`)
    .join("\n");

  const prompt = `ANALYSE DUE DILIGENCE M&A
Entreprise: ${company} | Période: ${period} | Devise: ${currency}

DONNÉES FINANCIÈRES:
${dataCtx}

SCORE DE RISQUE: ${riskResult.score}/100 — ${riskResult.grade} (${riskResult.label})
Flags détectés: ${flags.length} (${flags.filter(f=>f.severity==="CRITICAL").length} critiques, ${flags.filter(f=>f.severity==="HIGH").length} élevés, ${flags.filter(f=>f.severity==="MEDIUM").length} modérés)
${flagsCtx ? `\nPRINCIPAUX FLAGS:\n${flagsCtx}` : ""}

Rédigez une analyse financière professionnelle en français, structurée ainsi (sans titres H1/H2, utiliser du gras **):

**Synthèse financière:** [2 phrases sur la performance globale et le contexte]

**Points de vigilance:** [3 points de risque numérotés, 1 phrase chacun]

**Structure financière:** [Évaluation de la solidité bilancielle et du niveau d'endettement, 2 phrases]

**Verdict:** Recommandation [FAVORABLE / NEUTRE / DÉFAVORABLE] — [1 phrase de justification directe]

Style: factuel, direct, professionnel (Big4 / fonds d'investissement). 180 mots maximum.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "Tu es un analyste M&A senior avec 15 ans d'expérience. Tes rapports sont concis, factuels, et de qualité Big4. Tu écris exclusivement en français.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 700,
      temperature: 0.2,
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.warn("Narrative generation failed:", err.message);
    return "";
  }
}
