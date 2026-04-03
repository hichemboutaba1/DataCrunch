/**
 * Red flags detection and risk scoring for M&A due diligence
 * Returns flags array, numeric risk score, and letter grade A/B/C/D
 */

export function analyzeRedFlags(extracted) {
  const flags = [];
  let riskScore = 0;
  const type = extracted.document_type;

  if (type === "financial_statement") {
    const revenue   = extracted.revenue?.total_calculated;
    const expenses  = extracted.expenses?.total_calculated;
    const ebitda    = extracted.ebitda;
    const netIncome = extracted.net_income;
    const assets    = extracted.assets?.total_calculated;
    const liabilities = extracted.liabilities?.total_calculated;

    // EBITDA margin
    if (revenue && ebitda != null) {
      const margin = ebitda / revenue;
      if (margin < 0) {
        flags.push({ severity: "HIGH", category: "Profitability", label: "Negative EBITDA", detail: `EBITDA margin: ${(margin * 100).toFixed(1)}%` });
        riskScore += 3;
      } else if (margin < 0.05) {
        flags.push({ severity: "MEDIUM", category: "Profitability", label: "Very low EBITDA margin (<5%)", detail: `Current margin: ${(margin * 100).toFixed(1)}%` });
        riskScore += 2;
      } else if (margin < 0.1) {
        flags.push({ severity: "LOW", category: "Profitability", label: "Below-average EBITDA margin (<10%)", detail: `Current margin: ${(margin * 100).toFixed(1)}%` });
        riskScore += 1;
      }
    }

    // Net loss
    if (netIncome != null && netIncome < 0) {
      flags.push({ severity: "HIGH", category: "Profitability", label: "Net loss (negative net income)", detail: `Net income: ${netIncome.toLocaleString()}` });
      riskScore += 3;
    }

    // Expense ratio
    if (revenue && expenses) {
      const ratio = expenses / revenue;
      if (ratio > 0.95) {
        flags.push({ severity: "HIGH", category: "Expenses", label: "Extremely high expense ratio (>95%)", detail: `Expenses = ${(ratio * 100).toFixed(1)}% of revenue` });
        riskScore += 2;
      } else if (ratio > 0.85) {
        flags.push({ severity: "MEDIUM", category: "Expenses", label: "High expense ratio (>85%)", detail: `Expenses = ${(ratio * 100).toFixed(1)}% of revenue` });
        riskScore += 1;
      }
    }

    // Leverage / solvency
    if (assets && liabilities) {
      const leverage = liabilities / assets;
      if (leverage > 0.8) {
        flags.push({ severity: "HIGH", category: "Balance Sheet", label: "Very high leverage (>80%)", detail: `Liabilities = ${(leverage * 100).toFixed(1)}% of assets` });
        riskScore += 3;
      } else if (leverage > 0.6) {
        flags.push({ severity: "MEDIUM", category: "Balance Sheet", label: "Elevated leverage (>60%)", detail: `Liabilities = ${(leverage * 100).toFixed(1)}% of assets` });
        riskScore += 1;
      }
      // Negative equity
      if (liabilities > assets) {
        flags.push({ severity: "HIGH", category: "Balance Sheet", label: "Negative net equity", detail: `Liabilities exceed assets` });
        riskScore += 3;
      }
    }

    // Validation mismatches
    for (const sec of ["revenue", "expenses", "assets", "liabilities"]) {
      if (extracted[sec]?.mismatch) {
        flags.push({ severity: "MEDIUM", category: "Data Quality", label: `${sec} total mismatch`, detail: "AI-extracted total doesn't match sum of line items" });
        riskScore += 1;
      }
    }
  }

  else if (type === "revenue_list") {
    const clients = [...(extracted.clients || [])].sort((a, b) => b.revenue - a.revenue);
    const total = extracted.total_calculated || 1;

    // Single client concentration
    if (clients[0]) {
      const pct = clients[0].revenue / total;
      if (pct > 0.5) {
        flags.push({ severity: "HIGH", category: "Concentration", label: `Single client = ${(pct * 100).toFixed(0)}% of revenue`, detail: `${clients[0].name}` });
        riskScore += 4;
      } else if (pct > 0.3) {
        flags.push({ severity: "MEDIUM", category: "Concentration", label: `Single client = ${(pct * 100).toFixed(0)}% of revenue`, detail: `${clients[0].name}` });
        riskScore += 2;
      }
    }

    // Top 3 concentration
    if (clients.length >= 3) {
      const top3pct = clients.slice(0, 3).reduce((s, c) => s + c.revenue, 0) / total;
      if (top3pct > 0.8) {
        flags.push({ severity: "HIGH", category: "Concentration", label: `Top 3 clients = ${(top3pct * 100).toFixed(0)}% of revenue`, detail: "Extremely concentrated revenue base" });
        riskScore += 2;
      }
    }

    // Very few clients
    if (clients.length <= 3 && clients.length > 0) {
      flags.push({ severity: "HIGH", category: "Concentration", label: `Only ${clients.length} client(s)`, detail: "Critical revenue concentration risk" });
      riskScore += 2;
    } else if (clients.length <= 7) {
      flags.push({ severity: "LOW", category: "Concentration", label: `Only ${clients.length} clients`, detail: "Limited client diversification" });
      riskScore += 1;
    }

    // Total mismatch
    if (extracted.mismatch) {
      flags.push({ severity: "MEDIUM", category: "Data Quality", label: "Revenue total mismatch", detail: "Sum of clients ≠ stated total" });
      riskScore += 1;
    }
  }

  else if (type === "payroll") {
    const employees = [...(extracted.employees || [])].sort((a, b) => b.gross_salary - a.gross_salary);
    const total = extracted.total_gross_calculated || 0;
    const headcount = extracted.headcount || employees.length;

    // Key person risk (one person > 25% of payroll)
    if (employees[0] && total) {
      const pct = employees[0].gross_salary / total;
      if (pct > 0.3) {
        flags.push({ severity: "HIGH", category: "Key Person Risk", label: `Key person dependency: ${(pct * 100).toFixed(0)}% of payroll`, detail: employees[0].name });
        riskScore += 2;
      }
    }

    // Very small team
    if (headcount > 0 && headcount < 5) {
      flags.push({ severity: "MEDIUM", category: "HR", label: `Very small team (${headcount} employees)`, detail: "High key person and operational risk" });
      riskScore += 1;
    }

    // Average salary check (above 200K EUR/year is unusual for small co)
    const avgSalary = headcount ? total / headcount : 0;
    if (avgSalary > 200000) {
      flags.push({ severity: "LOW", category: "HR", label: "Very high average salary", detail: `Avg: ${avgSalary.toLocaleString()} per employee` });
      riskScore += 1;
    }

    if (extracted.mismatch) {
      flags.push({ severity: "MEDIUM", category: "Data Quality", label: "Payroll total mismatch", detail: "Sum of salaries ≠ stated total" });
      riskScore += 1;
    }
  }

  // Risk grade
  let grade, gradeLabel, gradeColor;
  if (riskScore === 0)      { grade = "A"; gradeLabel = "Low Risk";      gradeColor = "3DAA5C"; }
  else if (riskScore <= 2)  { grade = "B"; gradeLabel = "Moderate Risk"; gradeColor = "F39C12"; }
  else if (riskScore <= 5)  { grade = "C"; gradeLabel = "Elevated Risk"; gradeColor = "E67E22"; }
  else                      { grade = "D"; gradeLabel = "High Risk";     gradeColor = "C0392B"; }

  return { flags, riskScore, grade, gradeLabel, gradeColor };
}

// M&A Due Diligence checklist — what's missing
export function generateChecklist(documents) {
  const types = new Set(documents.map(d => d.document_type));
  const completed = documents.filter(d => d.status === "completed");

  const checklist = [
    {
      category: "Financial",
      item: "Financial Statement (P&L)",
      done: types.has("financial_statement"),
      priority: "REQUIRED",
    },
    {
      category: "Financial",
      item: "Balance Sheet",
      done: types.has("financial_statement"),
      priority: "REQUIRED",
    },
    {
      category: "Commercial",
      item: "Revenue breakdown by client",
      done: types.has("revenue_list"),
      priority: "REQUIRED",
    },
    {
      category: "HR",
      item: "Payroll / Staff list",
      done: types.has("payroll"),
      priority: "REQUIRED",
    },
    {
      category: "Financial",
      item: "3-year financial history (N, N-1, N-2)",
      done: completed.filter(d => d.document_type === "financial_statement").length >= 3,
      priority: "IMPORTANT",
    },
    {
      category: "Legal",
      item: "Corporate structure / Cap table",
      done: false,
      priority: "IMPORTANT",
    },
    {
      category: "Legal",
      item: "Material contracts",
      done: false,
      priority: "IMPORTANT",
    },
    {
      category: "Financial",
      item: "Tax returns (3 years)",
      done: false,
      priority: "IMPORTANT",
    },
    {
      category: "HR",
      item: "Key employment contracts",
      done: false,
      priority: "IMPORTANT",
    },
    {
      category: "Commercial",
      item: "Customer contracts (top 5)",
      done: false,
      priority: "RECOMMENDED",
    },
    {
      category: "Financial",
      item: "Cash flow statement",
      done: false,
      priority: "RECOMMENDED",
    },
    {
      category: "Legal",
      item: "IP / Patents / Trademarks",
      done: false,
      priority: "RECOMMENDED",
    },
  ];

  const doneCount = checklist.filter(i => i.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);
  return { checklist, doneCount, total: checklist.length, completionPct: pct };
}
