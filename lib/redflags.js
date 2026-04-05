export function analyzeRedFlags(data) {
  const flags = [];
  const type = data.document_type;

  function addFlag(severity, category, label, detail) {
    flags.push({ severity, category, label, detail });
  }

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
      addFlag("HIGH", "Rentabilité", "EBITDA négatif",
        `Marge EBITDA: ${((ebitda / revenue) * 100).toFixed(1)}% — perte opérationnelle`);
    } else if (ebitda != null && revenue > 0 && ebitda / revenue < 0.05) {
      addFlag("MEDIUM", "Rentabilité", "EBITDA très faible",
        `Marge EBITDA: ${((ebitda / revenue) * 100).toFixed(1)}% (seuil critique < 5%)`);
    }

    // Net loss
    if (netIncome != null && netIncome < 0) {
      addFlag("HIGH", "Rentabilité", "Résultat net négatif",
        `Perte nette: ${netIncome.toLocaleString("fr-FR")} — exercice déficitaire`);
    }

    // Charges > 90% revenus
    if (revenue > 0 && expenses > 0) {
      const ratio = expenses / revenue;
      if (ratio > 0.95) {
        addFlag("HIGH", "Charges", "Charges critiques",
          `Ratio charges/revenus: ${(ratio * 100).toFixed(1)}% — marge quasi nulle`);
      } else if (ratio > 0.90) {
        addFlag("MEDIUM", "Charges", "Charges élevées",
          `Ratio charges/revenus: ${(ratio * 100).toFixed(1)}% (seuil alerte > 90%)`);
      }
    }

    // Dettes > 2x capitaux propres
    if (equity > 0 && liabilities > 0) {
      const leverage = liabilities / equity;
      if (leverage > 3) {
        addFlag("HIGH", "Structure financière", "Levier excessif",
          `Dettes/Fonds propres: ${leverage.toFixed(2)}x (critique > 3x)`);
      } else if (leverage > 2) {
        addFlag("MEDIUM", "Structure financière", "Levier financier élevé",
          `Dettes/Fonds propres: ${leverage.toFixed(2)}x (alerte > 2x)`);
      }
    } else if (equity < 0) {
      addFlag("HIGH", "Structure financière", "Capitaux propres négatifs",
        `Fonds propres: ${equity.toLocaleString("fr-FR")} — situation de fonds propres négatifs`);
    }

    // Revenue = 0
    if (revenue === 0 && data.revenue?.items?.length > 0) {
      addFlag("HIGH", "Revenus", "Chiffre d'affaires nul", "Aucun revenu déclaré malgré des postes de revenus");
    }
  }

  if (type === "revenue_list") {
    const clients = data.clients || [];
    const total = data.total_stated || clients.reduce((a, c) => a + (c.revenue || 0), 0);

    // Concentration client unique > 30%
    const alreadyFlagged = new Set();
    for (const client of clients) {
      const pct = total > 0 ? (client.revenue / total) * 100 : (client.percentage || 0);
      if (pct > 50 && !alreadyFlagged.has(client.name)) {
        addFlag("HIGH", "Concentration clients", `Dépendance critique: ${client.name}`,
          `Représente ${pct.toFixed(1)}% du CA — risque de churn majeur`);
        alreadyFlagged.add(client.name);
      } else if (pct > 30 && !alreadyFlagged.has(client.name)) {
        addFlag("MEDIUM", "Concentration clients", `Client concentré: ${client.name}`,
          `Représente ${pct.toFixed(1)}% du CA (seuil > 30%)`);
        alreadyFlagged.add(client.name);
      }
    }

    // Top 3 clients > 60%
    const sorted = [...clients].sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
    const top3 = sorted.slice(0, 3);
    const top3Sum = top3.reduce((a, c) => a + (c.revenue || 0), 0);
    const top3Pct = total > 0 ? (top3Sum / total) * 100 : 0;
    if (top3Pct > 80) {
      addFlag("HIGH", "Concentration clients", "Top 3 clients — dépendance critique",
        `Top 3 clients: ${top3Pct.toFixed(1)}% du CA`);
    } else if (top3Pct > 60) {
      addFlag("MEDIUM", "Concentration clients", "Top 3 clients concentrés",
        `Top 3 clients: ${top3Pct.toFixed(1)}% du CA (seuil > 60%)`);
    }

    // Peu de clients
    if (clients.length <= 3 && clients.length > 0) {
      addFlag("LOW", "Concentration clients", "Base clients très étroite",
        `Seulement ${clients.length} client(s) — dépendance structurelle`);
    }
  }

  if (type === "payroll") {
    const employees = data.employees || [];
    if (employees.length === 0) {
      addFlag("MEDIUM", "Masse salariale", "Aucun employé extrait",
        "Impossible d'analyser la masse salariale — vérifier le document");
    } else {
      // Écart salaires très important
      const salaries = employees.map((e) => e.gross_salary || 0).filter((s) => s > 0);
      if (salaries.length > 1) {
        const max = Math.max(...salaries);
        const min = Math.min(...salaries);
        const ratio = max / min;
        if (ratio > 20) {
          addFlag("MEDIUM", "Masse salariale", "Écart salarial très élevé",
            `Ratio max/min salaire: ${ratio.toFixed(0)}x (${min.toLocaleString("fr-FR")} → ${max.toLocaleString("fr-FR")})`);
        }
      }
    }
  }

  // Sort by severity: HIGH first, then MEDIUM, then LOW
  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Weighted grade calculation
  const highCount = flags.filter((f) => f.severity === "HIGH").length;
  const medCount = flags.filter((f) => f.severity === "MEDIUM").length;
  const lowCount = flags.filter((f) => f.severity === "LOW").length;
  const weightedScore = highCount * 3 + medCount * 1 + lowCount * 0.3;

  let grade, score, label;
  if (highCount >= 2 || weightedScore >= 6) {
    grade = "D"; score = 4; label = "High Risk";
  } else if (highCount === 1 || weightedScore >= 3) {
    grade = "C"; score = 3; label = "Elevated Risk";
  } else if (medCount >= 2 || weightedScore >= 1) {
    grade = "B"; score = 2; label = "Moderate Risk";
  } else {
    grade = "A"; score = 1; label = "Low Risk";
  }

  return { flags, grade, score, label };
}
