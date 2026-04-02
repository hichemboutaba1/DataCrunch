import ExcelJS from "exceljs";

const NAVY = "FF1B2A4A";
const GREEN = "FF3DAA5C";
const RED = "FFC0392B";
const WHITE = "FFFFFFFF";
const LIGHT = "FFF5F7FA";

function hdr(ws, row, col, value) {
  const c = ws.getCell(row, col);
  c.value = value;
  c.font = { name: "Calibri", bold: true, color: { argb: WHITE }, size: 11 };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  c.alignment = { horizontal: "center", vertical: "middle" };
}

function data(ws, row, col, value, opts = {}) {
  const c = ws.getCell(row, col);
  c.value = value;
  c.font = { name: "Calibri", bold: opts.bold, color: { argb: opts.color || "FF000000" }, size: 10 };
  if (opts.bg) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg } };
  c.alignment = { horizontal: typeof value === "number" ? "right" : "left", vertical: "middle" };
  if (opts.numFmt) c.numFmt = opts.numFmt;
}

function sectionHeader(ws, row, cols, label) {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = label;
  c.font = { name: "Calibri", bold: true, color: { argb: WHITE }, size: 11 };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  c.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(row).height = 22;
}

function logoHeader(ws, title, subtitle, cols) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = `DataCrunch — ${title}`;
  t.font = { name: "Calibri", bold: true, size: 16, color: { argb: WHITE } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  t.alignment = { horizontal: "left", vertical: "middle", indent: 2 };
  ws.getRow(1).height = 36;

  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: "Calibri", size: 10, italic: true, color: { argb: NAVY } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
  s.alignment = { horizontal: "left", vertical: "middle", indent: 2 };
  ws.getRow(2).height = 20;
}

export async function generateExcel(extracted) {
  const wb = new ExcelJS.Workbook();
  const type = extracted.document_type;
  const company = extracted.company_name || "N/A";
  const period = extracted.period || "N/A";
  const currency = extracted.currency || "EUR";
  const fmt = `#,##0.00 "${currency}"`;

  if (type === "financial_statement") {
    const ws = wb.addWorksheet("Financial Summary");
    ws.views = [{ showGridLines: false }];
    logoHeader(ws, "Financial Summary", `${company} — ${period}`, 4);
    ["Category", "Item", "Amount", "Validation"].forEach((h, i) => hdr(ws, 3, i + 1, h));

    let row = 4;
    for (const [name, section] of [
      ["Revenue", extracted.revenue],
      ["Expenses", extracted.expenses],
      ["Assets", extracted.assets],
      ["Liabilities", extracted.liabilities],
    ]) {
      if (!section?.items?.length) continue;
      sectionHeader(ws, row, 4, name.toUpperCase());
      row++;
      for (const item of section.items) {
        const bg = row % 2 === 0 ? LIGHT : WHITE;
        data(ws, row, 1, name, { bg });
        data(ws, row, 2, item.label, { bg });
        data(ws, row, 3, item.amount, { bg, numFmt: fmt });
        data(ws, row, 4, "", { bg });
        row++;
      }
      const mismatch = section.mismatch && section.total_stated != null;
      const valText = mismatch
        ? `⚠️ MISMATCH: stated=${section.total_stated?.toLocaleString()} calc=${section.total_calculated?.toLocaleString()}`
        : section.total_stated != null ? "✅ Validated" : "";
      data(ws, row, 2, `TOTAL ${name}`, { bold: true, bg: "FFE8F5E9", color: NAVY });
      data(ws, row, 3, section.total_calculated, { bold: true, bg: "FFE8F5E9", numFmt: fmt, color: NAVY });
      data(ws, row, 4, valText, { bg: mismatch ? "FFFDECEA" : "FFE8F5E9", color: mismatch ? RED : GREEN, bold: mismatch });
      row += 2;
    }
    if (extracted.ebitda != null) { data(ws, row, 2, "EBITDA"); data(ws, row, 3, extracted.ebitda, { numFmt: fmt, bold: true }); row++; }
    if (extracted.net_income != null) { data(ws, row, 2, "Net Income"); data(ws, row, 3, extracted.net_income, { numFmt: fmt, bold: true }); }
    ws.getColumn(1).width = 18; ws.getColumn(2).width = 35; ws.getColumn(3).width = 22; ws.getColumn(4).width = 55;
  }

  else if (type === "revenue_list") {
    const ws = wb.addWorksheet("Revenue per Client");
    ws.views = [{ showGridLines: false }];
    logoHeader(ws, "Revenue per Client", `${company} — ${period}`, 5);
    ["#", "Client", "Revenue", "% Total", "Flag"].forEach((h, i) => hdr(ws, 3, i + 1, h));
    const total = extracted.total_calculated || 1;
    extracted.clients?.forEach((c, i) => {
      const row = i + 4;
      const bg = row % 2 === 0 ? LIGHT : WHITE;
      const pct = (c.revenue / total) * 100;
      data(ws, row, 1, i + 1, { bg });
      data(ws, row, 2, c.name, { bg });
      data(ws, row, 3, c.revenue, { bg, numFmt: fmt });
      data(ws, row, 4, pct, { bg, numFmt: '0.0"%"' });
      data(ws, row, 5, pct > 30 ? "⚠️ High concentration" : "", { bg, color: pct > 30 ? RED : "FF000000" });
    });
    const tr = (extracted.clients?.length || 0) + 4;
    data(ws, tr, 2, "TOTAL", { bold: true, bg: "FFE8F5E9", color: NAVY });
    data(ws, tr, 3, extracted.total_calculated, { bold: true, bg: "FFE8F5E9", numFmt: fmt });
    data(ws, tr, 5, extracted.mismatch ? "⚠️ MISMATCH" : "✅ Validated", { bold: true, color: extracted.mismatch ? RED : GREEN });
    ws.getColumn(1).width = 6; ws.getColumn(2).width = 35; ws.getColumn(3).width = 22; ws.getColumn(4).width = 12; ws.getColumn(5).width = 30;
  }

  else if (type === "payroll") {
    const ws = wb.addWorksheet("Payroll");
    ws.views = [{ showGridLines: false }];
    logoHeader(ws, "Payroll Analysis", `${company} — ${period}`, 5);
    ["#", "Employee", "Role", "Department", "Gross Salary"].forEach((h, i) => hdr(ws, 3, i + 1, h));
    extracted.employees?.forEach((e, i) => {
      const row = i + 4;
      const bg = row % 2 === 0 ? LIGHT : WHITE;
      data(ws, row, 1, i + 1, { bg });
      data(ws, row, 2, e.name, { bg });
      data(ws, row, 3, e.role || "", { bg });
      data(ws, row, 4, e.department || "", { bg });
      data(ws, row, 5, e.gross_salary, { bg, numFmt: fmt });
    });
    const tr = (extracted.employees?.length || 0) + 4;
    data(ws, tr, 2, `TOTAL — ${extracted.headcount || extracted.employees?.length} employees`, { bold: true, bg: "FFE8F5E9", color: NAVY });
    data(ws, tr, 5, extracted.total_gross_calculated, { bold: true, bg: "FFE8F5E9", numFmt: fmt });
    ws.getColumn(1).width = 6; ws.getColumn(2).width = 30; ws.getColumn(3).width = 25; ws.getColumn(4).width = 20; ws.getColumn(5).width = 20;
  }

  // Validation sheet
  const vws = wb.addWorksheet("Validation Report");
  vws.views = [{ showGridLines: false }];
  logoHeader(vws, "Validation Report", "AI Extraction Quality Check", 3);
  ["Check", "Status", "Details"].forEach((h, i) => hdr(vws, 3, i + 1, h));
  const notes = extracted.validation_notes || "";
  vws.getCell(4, 1).value = "AI Validation";
  vws.getCell(4, 2).value = notes.includes("mismatch") ? "⚠️ Issues found" : "✅ OK";
  vws.getCell(4, 3).value = notes;
  vws.getColumn(1).width = 20; vws.getColumn(2).width = 20; vws.getColumn(3).width = 70;

  return wb.xlsx.writeBuffer();
}
