export function validateExtractedData(data) {
  const notes = [];
  let passed = true;
  const TOL = 1;

  function sum(items) {
    return (items || []).reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }

  function check(label, items, total_stated) {
    if (total_stated == null) return;
    const calculated = sum(items);
    const diff = Math.abs(calculated - total_stated);
    if (diff > TOL) {
      notes.push(
        `${label}: total déclaré ${total_stated}, calculé ${calculated.toFixed(2)}, écart ${diff.toFixed(2)}`
      );
      passed = false;
    } else {
      notes.push(`${label}: OK (${total_stated})`);
    }
  }

  const type = data.document_type;

  if (type === "financial_statement") {
    check("Revenus", data.revenue?.items, data.revenue?.total_stated);
    check("Charges", data.expenses?.items, data.expenses?.total_stated);
    check("Actifs", data.assets?.items, data.assets?.total_stated);
    check("Passifs", data.liabilities?.items, data.liabilities?.total_stated);
  } else if (type === "revenue_list") {
    check("CA clients", data.clients?.map((c) => ({ amount: c.revenue })), data.total_stated);
    // Check percentages sum to ~100
    const pctSum = (data.clients || []).reduce((acc, c) => acc + (Number(c.percentage) || 0), 0);
    if (data.clients?.length > 0 && Math.abs(pctSum - 100) > 2) {
      notes.push(`Pourcentages clients: somme ${pctSum.toFixed(1)}% (attendu ~100%)`);
    }
  } else if (type === "payroll") {
    check(
      "Masse salariale brute",
      data.employees?.map((e) => ({ amount: e.gross_salary })),
      data.total_gross_stated
    );
  }

  return { validation_passed: passed, validation_notes: notes.join(" | ") };
}
