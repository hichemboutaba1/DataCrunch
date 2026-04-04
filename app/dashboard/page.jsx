"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const NAVY = "#1B2A4A", GREEN = "#3DAA5C", RED = "#C0392B", YELLOW = "#F39C12";
const LIGHT = "#F0F4F8";

function api(url, opts = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...opts.headers } });
}

const TYPES = [
  { value: "financial_statement", label: "Financial Statement" },
  { value: "revenue_list", label: "Revenue per Client" },
  { value: "payroll", label: "Payroll" },
];

const STEPS = ["Uploading PDF", "Extracting text", "AI analysis", "Validating totals", "Generating Excel"];
const PAYSLIP_STEPS = ["Uploading PDFs", "Extracting payslips", "AI analysis", "Merging employees", "Generating Excel"];

// ─── Logo ────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 36, height: 36, background: GREEN, borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: -1,
      }}>DC</div>
      <div>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, lineHeight: 1 }}>DataCrunch</div>
        <div style={{ color: "#8FA3C0", fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5 }}>M&A Financial Analysis</div>
      </div>
    </div>
  );
}

// ─── Risk Badge ───────────────────────────────────────────────────────────────
function RiskBadge({ grade, label, flags }) {
  if (!grade) return <span style={{ color: "#B0BEC5" }}>—</span>;
  const colors = { A: "#3DAA5C", B: "#F39C12", C: "#E67E22", D: "#C0392B" };
  const c = colors[grade] || "#6B7A99";
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
      <span style={{ background: c, color:"#fff", borderRadius:4, padding:"1px 7px", fontWeight:800, fontSize:12 }}>{grade}</span>
      {flags > 0 && <span style={{ color: c, fontSize:11 }}>🚩{flags}</span>}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const m = {
    pending: { bg: "#EEF2F7", c: "#6B7A99", l: "Pending" },
    processing: { bg: "#FFF3CD", c: "#856404", l: "Processing…" },
    completed: { bg: "#D4EDDA", c: "#155724", l: "Completed" },
    failed: { bg: "#FDECEA", c: "#C0392B", l: "Failed" },
  };
  const x = m[status] || m.pending;
  return (
    <span style={{ background: x.bg, color: x.c, borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
      {x.l}
    </span>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────
function PreviewModal({ doc, onClose }) {
  if (!doc) return null;
  const d = doc.extracted_data;
  if (!d) return null;
  const currency = d.currency || "EUR";
  const fmt = (n) => n != null ? new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n) : "—";

  return (
    <div style={ms.overlay} onClick={onClose}>
      <div style={ms.modal} onClick={e => e.stopPropagation()}>
        <div style={ms.header}>
          <div>
            <div style={ms.title}>Preview — {doc.filename}</div>
            <div style={ms.sub}>{d.company_name || "N/A"} · {d.period || "N/A"} · {currency}</div>
          </div>
          <button style={ms.close} onClick={onClose}>✕</button>
        </div>
        <div style={ms.body}>
          {/* Validation */}
          <div style={{ ...ms.validBox, background: doc.validation_passed ? "#E8F5E9" : "#FFF3CD", borderColor: doc.validation_passed ? GREEN : YELLOW }}>
            <span style={{ fontWeight: 700, color: doc.validation_passed ? GREEN : YELLOW }}>
              {doc.validation_passed ? "✅ All totals validated" : "⚠️ Mismatch detected"}
            </span>
            <span style={{ marginLeft: 12, fontSize: 12, color: "#555" }}>{d.validation_notes}</span>
          </div>

          {/* Financial Statement */}
          {d.document_type === "financial_statement" && (
            <>
              {[["Revenue", d.revenue], ["Expenses", d.expenses], ["Assets", d.assets], ["Liabilities", d.liabilities]].map(([name, sec]) =>
                sec?.items?.length ? (
                  <div key={name} style={ms.section}>
                    <div style={ms.sectionTitle}>{name}</div>
                    <table style={ms.table}>
                      <thead><tr><th style={ms.th}>Item</th><th style={{ ...ms.th, textAlign: "right" }}>Amount</th></tr></thead>
                      <tbody>
                        {sec.items.map((item, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? LIGHT : "#fff" }}>
                            <td style={ms.td}>{item.label}</td>
                            <td style={{ ...ms.td, textAlign: "right", fontWeight: 600 }}>{fmt(item.amount)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: "#E8F5E9" }}>
                          <td style={{ ...ms.td, fontWeight: 700, color: NAVY }}>TOTAL</td>
                          <td style={{ ...ms.td, textAlign: "right", fontWeight: 700, color: NAVY }}>{fmt(sec.total_calculated)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : null
              )}
              {(d.ebitda != null || d.net_income != null) && (
                <div style={ms.section}>
                  <div style={ms.sectionTitle}>Profitability</div>
                  <table style={ms.table}><tbody>
                    {d.ebitda != null && <tr><td style={ms.td}>EBITDA</td><td style={{ ...ms.td, textAlign: "right", fontWeight: 700, color: GREEN }}>{fmt(d.ebitda)}</td></tr>}
                    {d.net_income != null && <tr><td style={ms.td}>Net Income</td><td style={{ ...ms.td, textAlign: "right", fontWeight: 700 }}>{fmt(d.net_income)}</td></tr>}
                  </tbody></table>
                </div>
              )}
            </>
          )}

          {/* Revenue list */}
          {d.document_type === "revenue_list" && d.clients?.length > 0 && (
            <div style={ms.section}>
              <div style={ms.sectionTitle}>Clients ({d.clients.length}) — Total: {fmt(d.total_calculated)}</div>
              <table style={ms.table}>
                <thead><tr><th style={ms.th}>Client</th><th style={{ ...ms.th, textAlign: "right" }}>Revenue</th><th style={{ ...ms.th, textAlign: "right" }}>%</th></tr></thead>
                <tbody>
                  {[...d.clients].sort((a, b) => b.revenue - a.revenue).map((c, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? LIGHT : "#fff" }}>
                      <td style={ms.td}>{c.name}</td>
                      <td style={{ ...ms.td, textAlign: "right" }}>{fmt(c.revenue)}</td>
                      <td style={{ ...ms.td, textAlign: "right", color: c.percentage > 30 ? RED : "#333" }}>{c.percentage?.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Payroll */}
          {d.document_type === "payroll" && d.employees?.length > 0 && (
            <div style={ms.section}>
              <div style={ms.sectionTitle}>Employees ({d.employees.length}) — Total: {fmt(d.total_gross_calculated)}</div>
              <table style={ms.table}>
                <thead><tr><th style={ms.th}>Name</th><th style={ms.th}>Role</th><th style={ms.th}>Dept</th><th style={{ ...ms.th, textAlign: "right" }}>Gross</th></tr></thead>
                <tbody>
                  {[...d.employees].sort((a, b) => b.gross_salary - a.gross_salary).map((e, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? LIGHT : "#fff" }}>
                      <td style={ms.td}>{e.name}</td>
                      <td style={ms.td}>{e.role || "—"}</td>
                      <td style={ms.td}>{e.department || "—"}</td>
                      <td style={{ ...ms.td, textAlign: "right", fontWeight: 600 }}>{fmt(e.gross_salary)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ms = {
  overlay: { position: "fixed", inset: 0, background: "rgba(27,42,74,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  modal: { background: "#fff", borderRadius: 14, width: "100%", maxWidth: 820, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" },
  header: { background: NAVY, borderRadius: "14px 14px 0 0", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { color: "#fff", fontWeight: 800, fontSize: 16 },
  sub: { color: "#8FA3C0", fontSize: 12, marginTop: 2 },
  close: { background: "transparent", border: "1px solid #8FA3C0", color: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 14 },
  body: { overflowY: "auto", padding: 20 },
  validBox: { border: "1px solid", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  section: { marginBottom: 20 },
  sectionTitle: { fontWeight: 800, fontSize: 13, color: NAVY, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, borderBottom: `2px solid ${GREEN}`, paddingBottom: 4 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { background: NAVY, color: "#fff", padding: "6px 10px", textAlign: "left", fontWeight: 700 },
  td: { padding: "6px 10px", borderBottom: "1px solid #F0F4F8" },
};

// ─── Combined Report Tab ──────────────────────────────────────────────────────
function CombinedTab({ docs }) {
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const completed = docs.filter(d => d.status === "completed");

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev);
  }

  async function downloadCombined() {
    if (!selected.length) return;
    setLoading(true);
    const res = await api("/api/documents/combined", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected }),
    });
    setLoading(false);
    if (!res.ok) { alert("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "DataCrunch_Combined.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={s.card}>
      <h2 style={s.sectionTitle}>Combined Due Diligence Report</h2>
      <p style={{ color: "#6B7A99", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Select up to 5 completed documents to merge into a single Excel workbook.
      </p>
      {completed.length === 0 ? (
        <p style={{ color: "#6B7A99" }}>No completed documents yet.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {completed.map(doc => (
              <label key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 7, background: selected.includes(doc.id) ? "#EEF2F7" : "#fff", border: `1.5px solid ${selected.includes(doc.id) ? NAVY : "#DEE2E6"}` }}>
                <input type="checkbox" checked={selected.includes(doc.id)} onChange={() => toggle(doc.id)} />
                <span style={{ fontWeight: 600, color: NAVY }}>{doc.filename}</span>
                <span style={{ color: "#6B7A99", fontSize: 12 }}>{doc.document_type?.replace(/_/g, " ")}</span>
                {doc.risk_grade && <RiskBadge grade={doc.risk_grade} label={doc.risk_label} flags={doc.red_flags_count} />}
              </label>
            ))}
          </div>
          <button style={{ ...s.uploadBtn, opacity: selected.length ? 1 : 0.5 }} onClick={downloadCombined} disabled={loading || !selected.length}>
            {loading ? "Generating…" : `⬇ Download Combined Excel (${selected.length} doc${selected.length !== 1 ? "s" : ""})`}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Checklist Tab ─────────────────────────────────────────────────────────────
const CHECKLIST_ITEMS = [
  { category: "Financial", item: "Financial Statement (P&L)", type: "financial_statement", priority: "REQUIRED" },
  { category: "Financial", item: "Balance Sheet", type: "financial_statement", priority: "REQUIRED" },
  { category: "Commercial", item: "Revenue breakdown by client", type: "revenue_list", priority: "REQUIRED" },
  { category: "HR", item: "Payroll / Staff list", type: "payroll", priority: "REQUIRED" },
  { category: "Financial", item: "3 years of financial history", type: null, multi: true, priority: "IMPORTANT" },
  { category: "Legal", item: "Corporate structure / Cap table", type: null, priority: "IMPORTANT" },
  { category: "Legal", item: "Material contracts", type: null, priority: "IMPORTANT" },
  { category: "Financial", item: "Tax returns (3 years)", type: null, priority: "IMPORTANT" },
  { category: "HR", item: "Key employment contracts", type: null, priority: "IMPORTANT" },
  { category: "Commercial", item: "Customer contracts (top 5)", type: null, priority: "RECOMMENDED" },
  { category: "Financial", item: "Cash flow statement", type: null, priority: "RECOMMENDED" },
  { category: "Legal", item: "IP / Patents / Trademarks", type: null, priority: "RECOMMENDED" },
];

function ChecklistTab({ docs }) {
  const completed = docs.filter(d => d.status === "completed");
  const types = new Set(completed.map(d => d.document_type));
  const fsDocs = completed.filter(d => d.document_type === "financial_statement").length;

  function isDone(item) {
    if (item.multi) return fsDocs >= 3;
    if (item.type) return types.has(item.type);
    return false;
  }

  const done = CHECKLIST_ITEMS.filter(isDone).length;
  const pct = Math.round((done / CHECKLIST_ITEMS.length) * 100);
  const pctColor = pct >= 80 ? GREEN : pct >= 50 ? YELLOW : RED;

  const priorityColor = { REQUIRED: RED, IMPORTANT: YELLOW, RECOMMENDED: "#6B7A99" };

  return (
    <div style={s.card}>
      <h2 style={s.sectionTitle}>Due Diligence Checklist</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: pctColor }}>{pct}%</div>
        <div>
          <div style={{ fontWeight: 700, color: NAVY }}>{done}/{CHECKLIST_ITEMS.length} items completed</div>
          <div style={{ fontSize: 12, color: "#6B7A99" }}>Upload more documents to complete the checklist</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 10, background: "#F0F4F8", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pctColor, borderRadius: 5, transition: "width 0.4s" }} />
          </div>
        </div>
      </div>
      <table style={{ ...ms.table, fontSize: 13 }}>
        <thead>
          <tr>
            <th style={ms.th}>Status</th>
            <th style={ms.th}>Category</th>
            <th style={ms.th}>Document</th>
            <th style={ms.th}>Priority</th>
          </tr>
        </thead>
        <tbody>
          {CHECKLIST_ITEMS.map((item, i) => {
            const done = isDone(item);
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? "#F0F4F8" : "#fff" }}>
                <td style={{ ...ms.td, textAlign: "center", fontSize: 16 }}>{done ? "✅" : "⬜"}</td>
                <td style={{ ...ms.td, color: "#6B7A99", fontSize: 11 }}>{item.category}</td>
                <td style={{ ...ms.td, fontWeight: done ? 400 : 600, color: done ? "#6B7A99" : NAVY, textDecoration: done ? "line-through" : "none" }}>{item.item}</td>
                <td style={{ ...ms.td }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: priorityColor[item.priority] }}>{item.priority}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Compare Tab ──────────────────────────────────────────────────────────────
function CompareTab({ docs, token }) {
  const [selA, setSelA] = useState("");
  const [selB, setSelB] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fsDocs = docs.filter(d => d.document_type === "financial_statement" && d.status === "completed");
  const currency = result?.docA?.currency || "EUR";
  const fmt = (n) => n != null ? new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n) : "—";
  const pct = (a, b) => a && b ? (((b - a) / Math.abs(a)) * 100).toFixed(1) + "%" : "—";
  const pctColor = (a, b) => !a || !b ? "#555" : b > a ? GREEN : RED;

  async function compare() {
    if (!selA || !selB || selA === selB) return setError("Select two different documents");
    setLoading(true); setError(""); setResult(null);
    const res = await api(`/api/documents/compare?a=${selA}&b=${selB}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "Compare failed");
    setResult(data);
  }

  async function downloadExcel() {
    if (!selA || !selB) return;
    const res = await api(`/api/documents/compare?a=${selA}&b=${selB}`, { method: "POST" });
    if (!res.ok) return alert("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "DataCrunch_NvsN1.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={s.card}>
        <h2 style={s.sectionTitle}>N vs N-1 Comparison</h2>
        <p style={{ color: "#6B7A99", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
          Compare two Financial Statement documents side by side to analyse year-over-year performance.
        </p>
        {error && <div style={s.err}>{error}</div>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={s.label}>Document A (N-1)</label>
            <select style={s.select} value={selA} onChange={e => setSelA(e.target.value)}>
              <option value="">-- Select --</option>
              {fsDocs.map(d => <option key={d.id} value={d.id}>{d.filename} ({d.id})</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Document B (N)</label>
            <select style={s.select} value={selB} onChange={e => setSelB(e.target.value)}>
              <option value="">-- Select --</option>
              {fsDocs.map(d => <option key={d.id} value={d.id}>{d.filename} ({d.id})</option>)}
            </select>
          </div>
          <button style={s.uploadBtn} onClick={compare} disabled={loading}>
            {loading ? "Comparing…" : "Compare"}
          </button>
          {result && (
            <button style={{ ...s.pptBtn, background: GREEN }} onClick={downloadExcel}>
              ⬇ Export Excel
            </button>
          )}
        </div>
      </div>

      {result && (
        <div style={s.card}>
          <h3 style={{ ...s.sectionTitle, marginBottom: 4 }}>
            {result.docA.period || "N-1"} → {result.docB.period || "N"}
          </h3>
          <table style={ms.table}>
            <thead>
              <tr>
                <th style={ms.th}>Metric</th>
                <th style={{ ...ms.th, textAlign: "right" }}>{result.docA.period || "N-1"}</th>
                <th style={{ ...ms.th, textAlign: "right" }}>{result.docB.period || "N"}</th>
                <th style={{ ...ms.th, textAlign: "right" }}>Change</th>
                <th style={{ ...ms.th, textAlign: "right" }}>%</th>
              </tr>
            </thead>
            <tbody>
              {result.comparison.metrics.map((m, i) => {
                const change = m.a != null && m.b != null ? m.b - m.a : null;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? LIGHT : "#fff", fontWeight: m.bold ? 700 : 400 }}>
                    <td style={{ ...ms.td, paddingLeft: m.bold ? 10 : 22, color: m.bold ? NAVY : "#3D4B66" }}>{m.label}</td>
                    <td style={{ ...ms.td, textAlign: "right" }}>{fmt(m.a)}</td>
                    <td style={{ ...ms.td, textAlign: "right" }}>{fmt(m.b)}</td>
                    <td style={{ ...ms.td, textAlign: "right", color: change == null ? "#555" : change >= 0 ? GREEN : RED }}>
                      {change != null ? (change >= 0 ? "+" : "") + fmt(change) : "—"}
                    </td>
                    <td style={{ ...ms.td, textAlign: "right", color: pctColor(m.a, m.b), fontWeight: 600 }}>
                      {pct(m.a, m.b)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Batch Payroll Tab ────────────────────────────────────────────────────────
function BatchPayrollTab({ onDone }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [error, setError] = useState("");
  const fileRef = useRef();

  async function handleBatchUpload(e) {
    e.preventDefault();
    if (!files.length) return setError("Select at least one PDF payslip");
    setUploading(true); setError(""); setStepIdx(0);

    let idx = 0;
    const timer = setInterval(() => {
      idx = Math.min(idx + 1, PAYSLIP_STEPS.length - 2);
      setStepIdx(idx);
    }, 2200);

    const form = new FormData();
    for (const f of files) form.append("files[]", f);

    const res = await api("/api/documents/batch-payroll", { method: "POST", body: form });
    const data = await res.json();

    clearInterval(timer);
    setStepIdx(PAYSLIP_STEPS.length - 1);
    await new Promise(r => setTimeout(r, 600));
    setUploading(false); setStepIdx(-1); setFiles([]);
    if (fileRef.current) fileRef.current.value = "";

    if (!res.ok) { setError(data.error || "Batch upload failed"); return; }

    // Download the combined Excel
    if (data.download_id) {
      const dl = await api(`/api/documents/${data.download_id}/download`);
      if (dl.ok) {
        const blob = await dl.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "DataCrunch_Payroll.xlsx"; a.click();
        URL.revokeObjectURL(url);
      }
    }
    onDone();
  }

  return (
    <div style={s.card}>
      <h2 style={s.sectionTitle}>Batch Payslip Upload</h2>
      <p style={{ color: "#6B7A99", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Upload multiple individual payslip PDFs (bulletins de salaire) at once. DataCrunch extracts each employee and merges them into a single payroll Excel.
      </p>
      {error && <div style={s.err}>{error}</div>}

      {uploading ? (
        <div style={s.steps}>
          {PAYSLIP_STEPS.map((step, i) => (
            <div key={i} style={{ ...s.step, ...(i < stepIdx ? s.stepDone : i === stepIdx ? s.stepActive : s.stepPending) }}>
              <div style={s.stepDot}>{i < stepIdx ? "✓" : i === stepIdx ? <span style={s.spinner}>◌</span> : "○"}</div>
              <span>{step}</span>
            </div>
          ))}
          <p style={{ color: "#6B7A99", fontSize: 12, marginTop: 8 }}>Processing {files.length} payslip{files.length !== 1 ? "s" : ""}…</p>
        </div>
      ) : (
        <form onSubmit={handleBatchUpload}>
          <label style={{ cursor: "pointer", display: "block", marginBottom: 16 }}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              multiple
              style={{ display: "none" }}
              onChange={e => setFiles(Array.from(e.target.files))}
            />
            <div style={{ ...s.fileBox, borderColor: files.length ? GREEN : "#DEE2E6" }}>
              {files.length
                ? `📄 ${files.length} payslip${files.length !== 1 ? "s" : ""} selected`
                : "📁 Click to select multiple payslip PDFs"}
            </div>
          </label>
          {files.length > 0 && (
            <div style={{ marginBottom: 14, maxHeight: 140, overflowY: "auto" }}>
              {files.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: "#6B7A99", padding: "2px 0" }}>📄 {f.name}</div>
              ))}
            </div>
          )}
          <button style={s.uploadBtn} type="submit" disabled={!files.length}>
            ⬆ Process {files.length || 0} Payslip{files.length !== 1 ? "s" : ""}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────
function TeamTab({ currentUser }) {
  const [members, setMembers] = useState([]);
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadTeam() {
    const res = await api("/api/auth/invite");
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members || []);
      setOrgName(data.organization || "");
    }
  }

  useEffect(() => { loadTeam(); }, []);

  async function handleInvite(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setInviteToken("");
    if (!email || !password) return setError("Email and password are required");
    setLoading(true);
    const res = await api("/api/auth/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: name, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || "Invite failed"); return; }
    setInviteToken(data.access_token);
    setSuccess(`Account created for ${email}`);
    setEmail(""); setName(""); setPassword("");
    loadTeam();
  }

  async function handleRemove(userId) {
    if (!confirm("Remove this team member?")) return;
    const res = await api("/api/auth/invite", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) loadTeam();
    else alert("Failed to remove member");
  }

  return (
    <div>
      <div style={s.card}>
        <h2 style={s.sectionTitle}>Team — {orgName}</h2>
        <p style={{ color: "#6B7A99", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
          All members share documents and analysis. Invite colleagues to collaborate on due diligence.
        </p>
        {members.length === 0
          ? <p style={{ color: "#6B7A99" }}>No team members yet.</p>
          : (
            <table style={{ ...ms.table, marginBottom: 0, fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={ms.th}>Name</th>
                  <th style={ms.th}>Email</th>
                  <th style={ms.th}>Role</th>
                  <th style={ms.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.id} style={{ background: i % 2 === 0 ? "#F0F4F8" : "#fff" }}>
                    <td style={ms.td}>{m.full_name || "—"}</td>
                    <td style={ms.td}>{m.email}</td>
                    <td style={ms.td}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: m.role === "member" ? "#6B7A99" : GREEN }}>
                        {m.role || "admin"}
                      </span>
                    </td>
                    <td style={ms.td}>
                      {m.id !== currentUser?.id && (
                        <button
                          style={{ ...s.dlBtn, background: RED }}
                          onClick={() => handleRemove(m.id)}
                        >Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

      <div style={s.card}>
        <h2 style={s.sectionTitle}>Invite Team Member</h2>
        {error && <div style={s.err}>{error}</div>}
        {success && (
          <div style={{ background: "#E8F5E9", border: "1px solid #3DAA5C", borderRadius: 7, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#155724" }}>
            ✅ {success}
            {inviteToken && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, color: NAVY, marginBottom: 4, fontSize: 12 }}>Login token (share with team member):</div>
                <code style={{ fontSize: 10, wordBreak: "break-all", background: "#F0F4F8", padding: "4px 8px", borderRadius: 4, display: "block" }}>
                  {inviteToken}
                </code>
              </div>
            )}
          </div>
        )}
        <form onSubmit={handleInvite}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={s.label}>Full Name</label>
              <input style={{ ...s.searchInput, width: "100%", boxSizing: "border-box" }}
                placeholder="Jean Dupont" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Email *</label>
              <input style={{ ...s.searchInput, width: "100%", boxSizing: "border-box" }}
                type="email" placeholder="jean@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>Temporary Password *</label>
            <input style={{ ...s.searchInput, width: "100%", boxSizing: "border-box", maxWidth: 320 }}
              type="password" placeholder="Set a password for them" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button style={s.uploadBtn} type="submit" disabled={loading}>
            {loading ? "Inviting…" : "➕ Add Team Member"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [sub, setSub] = useState(null);
  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState("upload");
  const [docType, setDocType] = useState("financial_statement");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const fileRef = useRef();
  const router = useRouter();

  const load = useCallback(async (opts = {}) => {
    const params = new URLSearchParams({ limit: "100" });
    if (opts.type) params.set("type", opts.type);
    if (opts.status) params.set("status", opts.status);
    if (opts.search) params.set("search", opts.search);
    const res = await api(`/api/auth/me?${params}`);
    if (!res.ok) { router.replace("/login"); return; }
    const data = await res.json();
    setUser(data.user);
    setSub(data.subscription);
    setDocs(data.documents || []);
    setTotal(data.total || 0);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when filters change
  useEffect(() => {
    const t = setTimeout(() => load({ type: typeFilter, status: statusFilter, search }), 300);
    return () => clearTimeout(t);
  }, [typeFilter, statusFilter, search, load]);

  async function handleUpload(e) {
    e.preventDefault();
    const file = fileRef.current?.files[0];
    if (!file) return setError("Please select a PDF file");
    setUploading(true); setError(""); setStepIdx(0);

    // Animate steps while waiting for API
    let idx = 0;
    const timer = setInterval(() => {
      idx = Math.min(idx + 1, STEPS.length - 2);
      setStepIdx(idx);
    }, 1800);

    const form = new FormData();
    form.append("file", file);
    form.append("document_type", docType);
    const res = await api("/api/documents/upload", { method: "POST", body: form });
    const data = await res.json();

    clearInterval(timer);
    setStepIdx(STEPS.length - 1);
    await new Promise(r => setTimeout(r, 600));
    setUploading(false); setStepIdx(-1); setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) { setError(data.error || "Upload failed"); }
    else { await load({ type: typeFilter, status: statusFilter, search }); setTab("history"); }
  }

  async function handleDownload(docId, filename) {
    const res = await api(`/api/documents/${docId}/download`);
    if (!res.ok) { alert("Download failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename.replace(".pdf", ".xlsx"); a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePptx(docId, filename) {
    const res = await api(`/api/documents/${docId}/pptx`);
    if (!res.ok) { alert("PowerPoint export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename.replace(".pdf", "_DataCrunch.pptx"); a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePreview(docId) {
    const res = await api(`/api/documents/${docId}/preview`);
    if (!res.ok) { alert("Preview not available"); return; }
    const data = await res.json();
    setPreviewDoc(data);
  }

  async function handleDocx(docId, filename) {
    const res = await api(`/api/documents/${docId}/docx`);
    if (!res.ok) { alert("Word export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename.replace(/\.pdf$/i, "_DataCrunch.docx"); a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRetry(docId) {
    setRetrying(docId);
    // Re-trigger by re-uploading isn't possible without the file; instead mark as pending and trigger re-analysis
    // We'll show a message directing user to re-upload
    setRetrying(null);
    alert("To retry, please re-upload the PDF file. Failed documents cannot be re-processed without the original file.");
  }

  const usedPct = sub ? Math.min(100, (sub.documents_used / sub.monthly_quota) * 100) : 0;
  const qColor = usedPct >= 100 ? RED : usedPct >= 80 ? YELLOW : GREEN;

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <Logo />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {sub && (
            <div style={s.usagePill}>
              <span style={{ color: qColor, fontWeight: 700 }}>{sub.documents_used}</span>
              <span style={{ color: "#8FA3C0" }}>/{sub.monthly_quota} docs</span>
            </div>
          )}
          {user && <span style={{ color: "#8FA3C0", fontSize: 12 }}>{user.email}</span>}
          <button style={s.logout} onClick={() => { localStorage.removeItem("token"); router.push("/login"); }}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div style={s.tabBar}>
        {[
          { id: "upload", label: "⬆ Upload" },
          { id: "batch", label: "📂 Batch Payslips" },
          { id: "history", label: `📋 Documents (${total})` },
          { id: "compare", label: "⚖ N vs N-1" },
          { id: "combined", label: "📦 Combined Report" },
          { id: "checklist", label: "✅ Checklist" },
          { id: "team", label: "👥 Team" },
        ].map(t => (
          <button key={t.id} style={{ ...s.tabBtn, ...(tab === t.id ? s.tabActive : {}) }}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div style={s.content}>
        {/* ── UPLOAD TAB ── */}
        {tab === "upload" && (
          <>
            {sub && (
              <div style={s.card}>
                <div style={s.usageTitle}>MONTHLY USAGE</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                  <span style={{ color: qColor, fontWeight: 700, fontSize: 28 }}>{sub.documents_used}</span>
                  <span style={{ color: "#6B7A99", fontSize: 16 }}>/ {sub.monthly_quota} documents</span>
                </div>
                <div style={s.bar}><div style={{ ...s.fill, width: `${usedPct}%`, background: qColor }} /></div>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  {sub.documents_used < sub.monthly_quota
                    ? <span style={{ color: GREEN }}>{sub.monthly_quota - sub.documents_used} remaining</span>
                    : <span style={{ color: RED }}>Over quota — 1€ per additional document</span>}
                  <span style={{ color: "#6B7A99", marginLeft: 14, fontSize: 12 }}>Status: {sub.status}</span>
                </div>
              </div>
            )}

            <div style={s.card}>
              <h2 style={s.sectionTitle}>Upload Financial Document</h2>
              {error && <div style={s.err}>{error}</div>}

              {uploading ? (
                <div style={s.steps}>
                  {STEPS.map((step, i) => (
                    <div key={i} style={{ ...s.step, ...(i < stepIdx ? s.stepDone : i === stepIdx ? s.stepActive : s.stepPending) }}>
                      <div style={s.stepDot}>
                        {i < stepIdx ? "✓" : i === stepIdx ? <span style={s.spinner}>◌</span> : "○"}
                      </div>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleUpload}>
                  <div style={s.types}>
                    {TYPES.map(t => (
                      <button key={t.value} type="button"
                        style={{ ...s.typeBtn, ...(docType === t.value ? s.typeBtnOn : {}) }}
                        onClick={() => setDocType(t.value)}>{t.label}</button>
                    ))}
                  </div>
                  <label style={{ cursor: "pointer", display: "block", marginBottom: 16 }}>
                    <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
                      onChange={e => setSelectedFile(e.target.files[0]?.name || null)} />
                    <div style={s.fileBox}>
                      {selectedFile ? `📄 ${selectedFile}` : "📁 Click to select a PDF file"}
                    </div>
                  </label>
                  <button style={s.uploadBtn} type="submit">⬆ Upload & Analyze</button>
                </form>
              )}
            </div>
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <div style={s.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ ...s.sectionTitle, marginBottom: 0 }}>Documents ({total})</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={s.searchInput} placeholder="🔍 Search filename…" value={search}
                  onChange={e => setSearch(e.target.value)} />
                <select style={s.filterSelect} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                  <option value="">All types</option>
                  <option value="financial_statement">Financial Statement</option>
                  <option value="revenue_list">Revenue per Client</option>
                  <option value="payroll">Payroll</option>
                </select>
                <select style={s.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>
            {docs.length === 0
              ? <p style={{ color: "#6B7A99", textAlign: "center", padding: "40px 0" }}>No documents found.</p>
              : <div style={{ overflowX: "auto" }}>
                  <table style={s.table}>
                    <thead>
                      <tr>{["File", "Type", "Status", "Risk", "Validation", "Date", "Actions"].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {docs.map(doc => (
                        <tr key={doc.id} style={s.tr}>
                          <td style={s.td}>
                            <span style={{ fontWeight: 600, color: NAVY }}>{doc.filename}</span>
                          </td>
                          <td style={s.td}>{doc.document_type?.replace(/_/g, " ")}</td>
                          <td style={s.td}><StatusBadge status={doc.status} /></td>
                          <td style={s.td}><RiskBadge grade={doc.risk_grade} label={doc.risk_label} flags={doc.red_flags_count} /></td>
                          <td style={s.td}>
                            {doc.validation_passed === null ? "—"
                              : doc.validation_passed
                                ? <span style={{ color: GREEN }}>✅ OK</span>
                                : <span style={{ color: RED }}>⚠️ Mismatch</span>}
                          </td>
                          <td style={s.td}>{new Date(doc.created_at).toLocaleDateString()}</td>
                          <td style={s.td}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {doc.status === "completed" && (<>
                                <button style={s.dlBtn} onClick={() => handlePreview(doc.id)}>Preview</button>
                                <button style={s.dlBtn} onClick={() => handleDownload(doc.id, doc.filename)}>Excel</button>
                                <button style={{ ...s.dlBtn, background: "#7B3F9E" }} onClick={() => handlePptx(doc.id, doc.filename)}>PPT</button>
                                <button style={{ ...s.dlBtn, background: "#2980B9" }} onClick={() => handleDocx(doc.id, doc.filename)}>Word</button>
                              </>)}
                              {doc.status === "failed" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <span style={{ color: RED, fontSize: 11 }}>{doc.error_message?.slice(0, 50) || "Processing failed"}</span>
                                  <button
                                    style={{ ...s.dlBtn, background: YELLOW, color: "#333", fontSize: 10 }}
                                    onClick={() => handleRetry(doc.id)}
                                    disabled={retrying === doc.id}
                                  >
                                    {retrying === doc.id ? "…" : "↺ Retry"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* ── BATCH PAYSLIPS TAB ── */}
        {tab === "batch" && (
          <BatchPayrollTab onDone={() => { load({ type: typeFilter, status: statusFilter, search }); setTab("history"); }} />
        )}

        {/* ── COMPARE TAB ── */}
        {tab === "compare" && <CompareTab docs={docs.length ? docs : []} />}

        {/* ── COMBINED REPORT TAB ── */}
        {tab === "combined" && <CombinedTab docs={docs} />}

        {/* ── CHECKLIST TAB ── */}
        {tab === "checklist" && <ChecklistTab docs={docs} />}

        {/* ── TEAM TAB ── */}
        {tab === "team" && <TeamTab currentUser={user} />}
      </div>

      {/* Preview Modal */}
      <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: LIGHT, fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { background: NAVY, padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 },
  usagePill: { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: "3px 12px", fontSize: 12, display: "flex", gap: 4 },
  logout: { background: "transparent", border: "1px solid #8FA3C0", color: "#fff", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  tabBar: { background: "#fff", borderBottom: "2px solid #DEE2E6", display: "flex", gap: 0, padding: "0 28px" },
  tabBtn: { padding: "14px 20px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#6B7A99", borderBottom: "2px solid transparent", marginBottom: -2 },
  tabActive: { color: NAVY, borderBottomColor: GREEN },
  content: { maxWidth: 1100, margin: "0 auto", padding: "28px 20px" },
  card: { background: "#fff", borderRadius: 12, padding: "22px 26px", marginBottom: 22, boxShadow: "0 2px 12px rgba(27,42,74,0.07)" },
  usageTitle: { fontSize: 11, fontWeight: 700, color: "#6B7A99", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
  bar: { height: 7, background: LIGHT, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, transition: "width 0.4s" },
  sectionTitle: { fontSize: 17, fontWeight: 800, color: NAVY, marginBottom: 16, marginTop: 0 },
  err: { background: "#FDECEA", color: RED, borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 13 },
  steps: { display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" },
  step: { display: "flex", alignItems: "center", gap: 10, fontSize: 14 },
  stepDot: { width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 },
  stepDone: { color: GREEN, opacity: 0.8 },
  stepActive: { color: NAVY, fontWeight: 700 },
  stepPending: { color: "#B0BEC5" },
  spinner: { display: "inline-block", animation: "spin 1s linear infinite" },
  types: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  typeBtn: { padding: "8px 16px", border: "1.5px solid #DEE2E6", borderRadius: 7, cursor: "pointer", fontSize: 13, background: "#fff", color: "#6B7A99", fontWeight: 600 },
  typeBtnOn: { borderColor: NAVY, background: NAVY, color: "#fff" },
  fileBox: { padding: "14px 20px", border: "2px dashed #DEE2E6", borderRadius: 8, color: "#6B7A99", fontSize: 14, textAlign: "center", marginBottom: 16 },
  uploadBtn: { padding: "11px 28px", background: GREEN, color: "#fff", border: "none", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  pptBtn: { padding: "11px 20px", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer" },
  searchInput: { padding: "7px 12px", border: "1.5px solid #DEE2E6", borderRadius: 7, fontSize: 13, outline: "none", minWidth: 200 },
  filterSelect: { padding: "7px 12px", border: "1.5px solid #DEE2E6", borderRadius: 7, fontSize: 13, background: "#fff", cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 },
  th: { background: LIGHT, color: NAVY, fontWeight: 700, padding: "10px 14px", textAlign: "left", borderBottom: "2px solid #DEE2E6" },
  tr: { borderBottom: "1px solid #F0F4F8" },
  td: { padding: "10px 14px", color: "#3D4B66", verticalAlign: "middle" },
  dlBtn: { padding: "4px 12px", background: NAVY, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 700 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#6B7A99", marginBottom: 4 },
  select: { padding: "8px 12px", border: "1.5px solid #DEE2E6", borderRadius: 7, fontSize: 13, background: "#fff", minWidth: 260 },
};
