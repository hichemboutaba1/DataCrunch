import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, BorderStyle,
  WidthType, ShadingType,
} from "docx";

const NAVY = "1B2A4A";
const GREEN = "3DAA5C";
const RED = "C0392B";

function fmtNum(n, currency = "EUR") {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function heading(text, level = 1) {
  return new Paragraph({
    text,
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    shading: level === 1 ? { type: ShadingType.SOLID, color: NAVY, fill: NAVY } : undefined,
    children: level === 1 ? [new TextRun({ text, color: "FFFFFF", bold: true, size: 28 })] : undefined,
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: opts.size || 20 })],
    spacing: { after: 80 },
    alignment: opts.align || AlignmentType.LEFT,
  });
}

function kpiRow(label, value, color = "000000") {
  return new TableRow({
    children: [
      new TableCell({
        children: [para(label, { bold: true, color: "6B7A99", size: 18 })],
        width: { size: 40, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, fill: "F0F4F8" },
      }),
      new TableCell({
        children: [para(value, { bold: true, color, size: 22 })],
        width: { size: 60, type: WidthType.PERCENTAGE },
      }),
    ],
  });
}

function dataTable(headers, rows) {
  const headerRow = new TableRow({
    children: headers.map(h => new TableCell({
      children: [para(h, { bold: true, color: "FFFFFF", size: 18 })],
      shading: { type: ShadingType.SOLID, fill: NAVY },
    })),
    tableHeader: true,
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell => new TableCell({
        children: [para(String(cell ?? "—"), { size: 18 })],
        shading: ri % 2 === 0 ? { type: ShadingType.SOLID, fill: "F5F7FA" } : undefined,
      })),
    })
  );

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

export async function generateDocx(extracted, riskData) {
  const company = extracted.company_name || "N/A";
  const period = extracted.period || "N/A";
  const currency = extracted.currency || "EUR";
  const type = extracted.document_type;
  const rf = riskData || { grade: "—", gradeLabel: "N/A", flags: [] };

  const sections = [];

  // ── Title ──────────────────────────────────────────────────────────────────
  sections.push(
    new Paragraph({
      children: [new TextRun({ text: "DataCrunch", bold: true, size: 56, color: NAVY })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "M&A Due Diligence Report", size: 32, color: GREEN })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `${company} — ${period}`, size: 28, color: "6B7A99" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  );

  // ── Executive Summary ──────────────────────────────────────────────────────
  sections.push(heading("Executive Summary"));

  if (type === "financial_statement") {
    const revenue = extracted.revenue?.total_calculated;
    const expenses = extracted.expenses?.total_calculated;
    const ebitda = extracted.ebitda;
    const netIncome = extracted.net_income;
    const assets = extracted.assets?.total_calculated;
    const liabilities = extracted.liabilities?.total_calculated;
    const equity = assets != null && liabilities != null ? assets - liabilities : null;
    const ebitdaMargin = revenue && ebitda != null ? ((ebitda / revenue) * 100).toFixed(1) + "%" : "N/A";

    const kpiTable = new Table({
      rows: [
        kpiRow("Total Revenue", fmtNum(revenue, currency)),
        kpiRow("Total Expenses", fmtNum(expenses, currency)),
        kpiRow("EBITDA", fmtNum(ebitda, currency), ebitda > 0 ? GREEN : RED),
        kpiRow("EBITDA Margin", ebitdaMargin, ebitda > 0 ? GREEN : RED),
        kpiRow("Net Income", fmtNum(netIncome, currency), netIncome > 0 ? GREEN : RED),
        kpiRow("Total Assets", fmtNum(assets, currency)),
        kpiRow("Total Liabilities", fmtNum(liabilities, currency)),
        kpiRow("Net Equity", fmtNum(equity, currency), equity > 0 ? GREEN : RED),
        kpiRow("Risk Grade", `${rf.grade} — ${rf.gradeLabel}`, rf.grade === "A" ? GREEN : rf.grade === "D" ? RED : "E67E22"),
      ],
      width: { size: 80, type: WidthType.PERCENTAGE },
    });
    sections.push(kpiTable, new Paragraph({ text: "", spacing: { after: 300 } }));

    // Revenue breakdown
    if (extracted.revenue?.items?.length) {
      sections.push(heading("Revenue Breakdown", 2));
      sections.push(dataTable(
        ["Revenue Item", "Amount", "% of Total"],
        extracted.revenue.items
          .sort((a, b) => b.amount - a.amount)
          .map(item => [
            item.label,
            fmtNum(item.amount, currency),
            revenue ? ((item.amount / revenue) * 100).toFixed(1) + "%" : "—",
          ])
      ));
      sections.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    }

    // Expenses
    if (extracted.expenses?.items?.length) {
      sections.push(heading("Expense Breakdown", 2));
      sections.push(dataTable(
        ["Expense Item", "Amount"],
        extracted.expenses.items.map(item => [item.label, fmtNum(item.amount, currency)])
      ));
      sections.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    }
  }

  if (type === "revenue_list" && extracted.clients?.length) {
    sections.push(heading("Revenue by Client", 2));
    const total = extracted.total_calculated || 1;
    sections.push(dataTable(
      ["Client", "Revenue", "% Total", "Risk"],
      [...extracted.clients]
        .sort((a, b) => b.revenue - a.revenue)
        .map(c => [
          c.name,
          fmtNum(c.revenue, currency),
          ((c.revenue / total) * 100).toFixed(1) + "%",
          (c.revenue / total) > 0.3 ? "🔴 High" : "🟢 Low",
        ])
    ));
    sections.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  if (type === "payroll" && extracted.employees?.length) {
    sections.push(heading("Payroll Summary", 2));
    const total = extracted.total_gross_calculated || 0;
    const headcount = extracted.headcount || extracted.employees.length;
    sections.push(new Table({
      rows: [
        kpiRow("Total Gross Payroll", fmtNum(total, currency)),
        kpiRow("Headcount", String(headcount)),
        kpiRow("Average Salary", fmtNum(headcount ? total / headcount : 0, currency)),
      ],
      width: { size: 60, type: WidthType.PERCENTAGE },
    }));
    sections.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    sections.push(heading("Employee List", 2));
    sections.push(dataTable(
      ["Employee", "Role", "Department", "Gross Salary"],
      [...extracted.employees]
        .sort((a, b) => b.gross_salary - a.gross_salary)
        .map(e => [e.name, e.role || "—", e.department || "—", fmtNum(e.gross_salary, currency)])
    ));
  }

  // ── Red Flags ──────────────────────────────────────────────────────────────
  sections.push(new Paragraph({ text: "", spacing: { after: 300 } }));
  sections.push(heading("Risk Assessment"));
  sections.push(para(`Risk Grade: ${rf.grade} — ${rf.gradeLabel}`, { bold: true, color: rf.grade === "A" ? GREEN : RED, size: 24 }));

  if (rf.flags?.length) {
    sections.push(dataTable(
      ["Severity", "Category", "Flag", "Details"],
      rf.flags.map(f => [f.severity, f.category, f.label, f.detail || "—"])
    ));
  } else {
    sections.push(para("✅ No red flags detected.", { color: GREEN }));
  }

  // ── Disclaimer ─────────────────────────────────────────────────────────────
  sections.push(new Paragraph({ text: "", spacing: { after: 400 } }));
  sections.push(para(
    "This report was generated by DataCrunch using AI (Groq Llama 3.3 70B). All totals are validated server-side. This document should be reviewed by a qualified financial professional before use in any transaction.",
    { color: "999999", size: 16 }
  ));
  sections.push(para(`Generated: ${new Date().toLocaleDateString("fr-FR")} | DataCrunch M&A Platform`, { color: "AAAAAA", size: 14 }));

  const doc = new Document({
    sections: [{ children: sections }],
    styles: {
      default: { document: { run: { font: "Calibri", size: 20 } } },
    },
  });

  return await Packer.toBuffer(doc);
}
