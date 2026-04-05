export function validateExtractedData(data) {
  const notes = [];
  let passed = true;

  // Relative tolerance: 0.1% of value, min 1 unit
  function tolerance(value) {
    return Math.max(1, Math.abs(value) * 0.001);
  }

  function sum(items) {
    return (items || []).reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }

  function check(label, items, total_stated) {
    if (total_stated == null) return;
    const calculated = sum(items);
    const tol = tolerance(total_stated);
    const diff = Math.abs(calculated - total_stated);
    if (diff > tol) {
      notes.push(
        `⚠ ${label}: déclaré ${total_stated.toLocaleString("fr-FR")}, calculé ${calculated.toLocaleString("fr-FR")}, écart ${diff.toLocaleString("fr-FR")}`
      );
      passed = false;
    } else {
      notes.push(`✓ ${label}: OK (${total_stated.toLocaleString("fr-FR")})`);
    }
  }

  const type = data.document_type;

  if (type === "financial_statement") {
    check("Revenus", data.revenue?.items, data.revenue?.total_stated);
    check("Charges", data.expenses?.items, data.expenses?.total_stated);
    check("Actifs", data.assets?.items, data.assets?.total_stated);
    check("Passifs", data.liabilities?.items, data.liabilities?.total_stated);

    // Coherence checks
    if (data.revenue?.total_stated != null && data.expenses?.total_stated != null) {
      const margin = data.revenue.total_stated > 0
        ? ((data.revenue.total_stated - data.expenses.total_stated) / data.revenue.total_stated) * 100
        : null;
      if (margin !== null) {
        notes.push(`ℹ Marge brute calculée: ${margin.toFixed(1)}%`);
      }
    }
    if (data.ebitda != null && data.revenue?.total_stated > 0) {
      const ebitdaMargin = (data.ebitda / data.revenue.total_stated) * 100;
      notes.push(`ℹ Marge EBITDA: ${ebitdaMargin.toFixed(1)}%`);
    }
  } else if (type === "revenue_list") {
    check("CA clients", data.clients?.map((c) => ({ amount: c.revenue })), data.total_stated);
    // Check percentages sum to ~100
    const pctSum = (data.clients || []).reduce((acc, c) => acc + (Number(c.percentage) || 0), 0);
    if (data.clients?.length > 0) {
      const pctDiff = Math.abs(pctSum - 100);
      if (pctDiff > 2) {
        notes.push(`⚠ Pourcentages clients: somme ${pctSum.toFixed(1)}% (attendu ~100%)`);
      } else {
        notes.push(`✓ Pourcentages clients: ${pctSum.toFixed(1)}%`);
      }
    }
  } else if (type === "payroll") {
    check(
      "Masse salariale brute",
      data.employees?.map((e) => ({ amount: e.gross_salary })),
      data.total_gross_stated
    );
    if (data.employees?.length > 0) {
      const avgGross = (data.employees.reduce((a, e) => a + (e.gross_salary || 0), 0)) / data.employees.length;
      notes.push(`ℹ Salaire brut moyen: ${avgGross.toLocaleString("fr-FR")}`);
    }
  }

  return { validation_passed: passed, validation_notes: notes.join(" | ") };
}
