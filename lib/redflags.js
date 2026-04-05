export function analyzeRedFlags(data) {
  const flags = [];
  const type = data.document_type;

  if (type === "financial_statement") {
    const revenue = data.revenue?.total_stated || 0;
    const expenses = data.expenses?.total_stated || 0;
    const ebitda = data.ebitda;
    const netIncome = data.net_income;
    const liabilities = data.liabilities?.total_stated || 0;
    const assets = data.assets?.total_stated || 0;
    const equity = assets - liabilities;

    // EBITDA margin < 0%
    if (ebitda != null && revenue > 0 && ebitda / revenue < 0) {
      flags.push({
        severity: "HIGH",
        category: "Rentabilité",
        label: "EBITDA négatif",
        detail: `Marge EBITDA: ${((ebitda / revenue) * 100).toFixed(1)}%`,
      });
    }

    // Net loss
    if (netIncome != null && netIncome < 0) {
      flags.push({
        severity: "HIGH",
        category: "Rentabilité",
        label: "Résultat net négatif",
        detail: `Perte nette: ${netIncome.toLocaleString()}`,
      });
    }

    // Charges > 90% revenus
    if (revenue > 0 && expenses / revenue > 0.9) {
      flags.push({
        severity: "MEDIUM",
        category: "Charges",
        label: "Charges élevées",
        detail: `Ratio charges/revenus: ${((expenses / revenue) * 100).toFixed(1)}%`,
      });
    }

    // Dettes > 2x capitaux propres
    if (equity > 0 && liabilities / equity > 2) {
      flags.push({
        severity: "MEDIUM",
        category: "Structure financière",
        label: "Levier financier élevé",
        detail: `Dettes/Fonds propres: ${(liabilities / equity).toFixed(2)}x`,
      });
    }
  }

  if (type === "revenue_list") {
    const clients = data.clients || [];
    const total = data.total_stated || clients.reduce((a, c) => a + (c.revenue || 0), 0);

    // Concentration client unique > 30%
    for (const client of clients) {
      const pct = total > 0 ? (client.revenue / total) * 100 : client.percentage || 0;
      if (pct > 30) {
        flags.push({
          severity: "MEDIUM",
          category: "Concentration clients",
          label: `Client concentré: ${client.name}`,
          detail: `Représente ${pct.toFixed(1)}% du CA`,
        });
      }
    }

    // Top 3 clients > 60%
    const sorted = [...clients].sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
    const top3 = sorted.slice(0, 3);
    const top3Sum = top3.reduce((a, c) => a + (c.revenue || 0), 0);
    const top3Pct = total > 0 ? (top3Sum / total) * 100 : 0;
    if (top3Pct > 60) {
      flags.push({
        severity: "MEDIUM",
        category: "Concentration clients",
        label: "Top 3 clients concentrés",
        detail: `Top 3 clients: ${top3Pct.toFixed(1)}% du CA`,
      });
    }
  }

  if (type === "payroll") {
    // Masse salariale > 70% revenus — si on a une référence
    // (standalone payroll, on signale juste le total)
    const employees = data.employees || [];
    if (employees.length === 0) {
      flags.push({
        severity: "LOW",
        category: "Masse salariale",
        label: "Aucun employé extrait",
        detail: "Impossible d'analyser la masse salariale",
      });
    }
  }

  // Grade calculation
  const highCount = flags.filter((f) => f.severity === "HIGH").length;
  const medCount = flags.filter((f) => f.severity === "MEDIUM").length;

  let grade, score, label;
  if (highCount >= 2) {
    grade = "D"; score = 4; label = "High Risk";
  } else if (highCount === 1) {
    grade = "C"; score = 3; label = "Elevated Risk";
  } else if (medCount >= 2) {
    grade = "C"; score = 3; label = "Elevated Risk";
  } else if (medCount === 1) {
    grade = "B"; score = 2; label = "Moderate Risk";
  } else {
    grade = "A"; score = 1; label = "Low Risk";
  }

  return { flags, grade, score, label };
}
