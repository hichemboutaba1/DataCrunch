/**
 * Server-side validation — never trust AI to calculate totals.
 * We compute all sums ourselves and compare to stated totals.
 */

const TOLERANCE = 1; // Allow 1 unit rounding difference

function toNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    // Guard against AI returning European float like 392.998 when real value is 392998.
    // If the number has 3 decimal places and looks like a thousands-formatted integer,
    // check if rounding it to integer makes more sense in context.
    // We can't be 100% sure, so just return as-is — the prompt fix handles this upstream.
    return val;
  }

  const s = String(val).trim();

  // Remove spaces (French/European thousands separator: "39 299 894")
  const noSpace = s.replace(/\s/g, "");

  // European format: dots as thousands, comma as decimal → "1.234.567,89" or "1.234.567"
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(noSpace)) {
    return parseFloat(noSpace.replace(/\./g, "").replace(",", "."));
  }

  // American format: commas as thousands, dot as decimal → "1,234,567.89" or "1,234,567"
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(noSpace)) {
    return parseFloat(noSpace.replace(/,/g, ""));
  }

  // European decimal only (no thousands): "1234,89"
  if (/^-?\d+(,\d+)$/.test(noSpace)) {
    return parseFloat(noSpace.replace(",", "."));
  }

  // Plain number after stripping any remaining non-numeric chars
  const cleaned = noSpace.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function sum(items) {
  return items?.reduce((acc, item) => acc + (toNumber(item.amount) || 0), 0) || 0;
}

function validateSection(section) {
  if (!section) return section;
  const items = section.items || [];
  const calculated = sum(items);
  const stated = toNumber(section.total_stated);
  const mismatch = stated !== null && Math.abs(calculated - stated) > TOLERANCE;

  return {
    ...section,
    total_calculated: calculated,
    total_stated: stated,
    mismatch,
  };
}

export function validateExtraction(extracted) {
  const doc = { ...extracted };

  // Convert all stated totals to numbers
  if (doc.ebitda !== undefined) doc.ebitda = toNumber(doc.ebitda);
  if (doc.net_income !== undefined) doc.net_income = toNumber(doc.net_income);

  // Validate each section server-side
  if (doc.revenue) doc.revenue = validateSection(doc.revenue);
  if (doc.expenses) doc.expenses = validateSection(doc.expenses);
  if (doc.assets) doc.assets = validateSection(doc.assets);
  if (doc.liabilities) doc.liabilities = validateSection(doc.liabilities);

  // Revenue list
  if (doc.clients) {
    const calculated = doc.clients.reduce((acc, c) => acc + (Number(c.revenue) || 0), 0);
    const stated = toNumber(doc.total_stated);
    doc.total_calculated = calculated;
    doc.total_stated = stated;
    doc.mismatch = stated !== null && Math.abs(calculated - stated) > TOLERANCE;

    // Recalculate percentages
    doc.clients = doc.clients.map((c) => ({
      ...c,
      revenue: Number(c.revenue) || 0,
      percentage: calculated > 0 ? Math.round((c.revenue / calculated) * 10000) / 100 : 0,
    }));
  }

  // Payroll
  if (doc.employees) {
    const calculated = doc.employees.reduce((acc, e) => acc + (Number(e.gross_salary) || 0), 0);
    const stated = toNumber(doc.total_gross_stated);
    doc.total_gross_calculated = calculated;
    doc.total_gross_stated = stated;
    doc.headcount = doc.employees.length;
    doc.mismatch = stated !== null && Math.abs(calculated - stated) > TOLERANCE;
  }

  // Build validation notes
  const issues = [];
  for (const key of ["revenue", "expenses", "assets", "liabilities"]) {
    if (doc[key]?.mismatch) {
      const diff = (doc[key].total_calculated ?? 0) - (doc[key].total_stated ?? 0);
      issues.push(`${key}: stated=${doc[key].total_stated?.toLocaleString() ?? "?"} calculated=${doc[key].total_calculated?.toLocaleString() ?? "?"} diff=${diff > 0 ? "+" : ""}${isNaN(diff) ? "?" : diff.toLocaleString()}`);
    }
  }
  if (doc.mismatch) {
    const diff = (doc.total_calculated ?? 0) - (doc.total_stated ?? 0);
    issues.push(`Total mismatch: diff=${diff > 0 ? "+" : ""}${isNaN(diff) ? "?" : diff.toLocaleString()}`);
  }

  doc.validation_notes = issues.length > 0
    ? `⚠️ Mismatches found: ${issues.join(" | ")}`
    : "✅ All totals validated server-side";

  return doc;
}
