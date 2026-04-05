"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const NAVY = "#1B2A4A";
const GREEN = "#3DAA5C";
const BG = "#F0F4F8";
const RED = "#C0392B";
const ORANGE = "#E67E22";

function api(path, opts = {}) {
  const token = localStorage.getItem("dc_token");
  return fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

// ==================== HEADER ====================
function Header({ user, subscription, onSignOut }) {
  return (
    <div style={{ background: NAVY, color: "#fff", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>Data<span style={{ color: GREEN }}>Crunch</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {subscription && (
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 12px", fontSize: 13 }}>
            {subscription.documents_used}/{subscription.monthly_quota} docs
          </div>
        )}
        <span style={{ fontSize: 13 }}>{user?.email}</span>
        <button onClick={onSignOut} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ==================== TAB BAR ====================
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "#fff", padding: "8px 16px", borderBottom: "1px solid #E2E8F0", flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: active === t.key ? 700 : 500, background: active === t.key ? NAVY : "transparent", color: active === t.key ? "#fff" : "#555" }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ==================== BADGE ====================
function Badge({ status }) {
  const colors = { processing: ORANGE, completed: GREEN, failed: RED };
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, color: "#fff", background: colors[status] || "#999" }}>
      {status}
    </span>
  );
}

function RiskBadge({ grade, label }) {
  if (!grade) return null;
  const c = { A: GREEN, B: ORANGE, C: ORANGE, D: RED };
  return <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, color: "#fff", background: c[grade] || "#999" }}>{grade} — {label}</span>;
}

// ==================== CARD ====================
function Card({ children, style }) {
  return <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(27,42,74,0.07)", padding: 24, ...style }}>{children}</div>;
}

// ==================== UPLOAD TAB ====================
function UploadTab({ onDone }) {
  const [file, setFile] = useState(null);
  const [type, setType] = useState("financial_statement");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function handleUpload() {
    if (!file) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("document_type", type);
      const res = await api("/api/documents/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload échoué");
      setResult(data.document);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h3 style={{ margin: "0 0 16px", color: NAVY }}>Uploader un document PDF</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
        <select value={type} onChange={(e) => setType(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1.5px solid #D0DAE8", fontSize: 14 }}>
          <option value="financial_statement">Bilan financier</option>
          <option value="revenue_list">Liste de revenus / clients</option>
          <option value="payroll">Bulletin de paie</option>
        </select>
        <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ padding: 10, border: "1.5px dashed #D0DAE8", borderRadius: 8, cursor: "pointer" }} />
        <button onClick={handleUpload} disabled={!file || loading}
          style={{ padding: "12px", background: loading ? "#9BB0C7" : GREEN, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Analyse en cours..." : "Analyser le document"}
        </button>
      </div>
      {error && <div style={{ marginTop: 12, padding: 12, background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, color: RED, fontSize: 13 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 16, padding: 16, background: "#F0FFF4", border: "1px solid #C6F6D5", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, color: GREEN }}>Analyse terminée</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{result.filename} — <Badge status={result.status} /> <RiskBadge grade={result.risk_grade} label={result.risk_label} /></div>
        </div>
      )}
    </Card>
  );
}

// ==================== DOCUMENTS TAB ====================
function DocumentsTab({ documents, onRefresh }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const filtered = documents.filter((d) => {
    if (typeFilter && d.document_type !== typeFilter) return false;
    if (statusFilter && d.status !== statusFilter) return false;
    if (search && !d.filename.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function openPreview(id) {
    setLoadingPreview(true);
    try {
      const res = await api(`/api/documents/${id}/preview`);
      const data = await res.json();
      if (res.ok) setPreview(data);
    } catch { /* ignore */ } finally { setLoadingPreview(false); }
  }

  function download(id, format) {
    const token = localStorage.getItem("dc_token");
    const url = format === "xlsx" ? `/api/documents/${id}/download` : `/api/documents/${id}/${format}`;
    window.open(`${url}?token=${token}`, "_blank");
  }

  return (
    <Card>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #D0DAE8", fontSize: 13, flex: 1, minWidth: 150 }} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #D0DAE8", fontSize: 13 }}>
          <option value="">Tous types</option>
          <option value="financial_statement">Bilan</option>
          <option value="revenue_list">Revenus</option>
          <option value="payroll">Paie</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #D0DAE8", fontSize: 13 }}>
          <option value="">Tous statuts</option>
          <option value="completed">Complété</option>
          <option value="processing">En cours</option>
          <option value="failed">Échoué</option>
        </select>
      </div>

      {filtered.length === 0 && <div style={{ color: "#999", textAlign: "center", padding: 32 }}>Aucun document</div>}

      {filtered.map((doc) => (
        <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #F0F0F0", flexWrap: "wrap", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{doc.filename}</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
              {doc.document_type} — {new Date(doc.created_at).toLocaleDateString("fr-FR")} — <Badge status={doc.status} />
              {doc.risk_grade && <> <RiskBadge grade={doc.risk_grade} label={doc.risk_label} /></>}
            </div>
          </div>
          {doc.status === "completed" && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => openPreview(doc.id)} style={smallBtn("#EBF5FB", NAVY)}>Preview</button>
              <button onClick={() => download(doc.id, "xlsx")} style={smallBtn("#E8F8F0", GREEN)}>Excel</button>
              <button onClick={() => download(doc.id, "pptx")} style={smallBtn("#FFF8E1", ORANGE)}>PPTX</button>
              <button onClick={() => download(doc.id, "docx")} style={smallBtn("#F3E8FF", "#7C3AED")}>Word</button>
            </div>
          )}
          {doc.status === "failed" && doc.error_message && (
            <div style={{ fontSize: 11, color: RED }}>{doc.error_message}</div>
          )}
        </div>
      ))}

      {/* Preview Modal */}
      {preview && <PreviewModal data={preview} onClose={() => setPreview(null)} />}
      {loadingPreview && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
        <div style={{ background: "#fff", padding: 32, borderRadius: 12, fontSize: 16 }}>Chargement...</div>
      </div>}
    </Card>
  );
}

function smallBtn(bg, color) {
  return { padding: "4px 10px", borderRadius: 6, border: "none", background: bg, color, fontSize: 12, fontWeight: 600, cursor: "pointer" };
}

// ==================== PREVIEW MODAL ====================
function PreviewModal({ data, onClose }) {
  const ex = data.extracted_data;
  if (!ex) return null;
  const fmtNum = (v) => v != null ? Number(v).toLocaleString("fr-FR") : "—";

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 32, maxWidth: 700, width: "90%", maxHeight: "80vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: NAVY }}>{ex.company_name || data.filename}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
          Période: {ex.period || "—"} | Devise: {ex.currency || "—"} | Type: {ex.document_type}
        </div>

        {ex.document_type === "financial_statement" && (
          <>
            <PreviewTable title="Revenus" items={ex.revenue?.items} total={ex.revenue?.total_stated} />
            <PreviewTable title="Charges" items={ex.expenses?.items} total={ex.expenses?.total_stated} />
            <div style={{ display: "flex", gap: 16, margin: "12px 0", flexWrap: "wrap" }}>
              <KPIBox label="EBITDA" value={fmtNum(ex.ebitda)} />
              <KPIBox label="Résultat net" value={fmtNum(ex.net_income)} />
            </div>
            <PreviewTable title="Actifs" items={ex.assets?.items} total={ex.assets?.total_stated} />
            <PreviewTable title="Passifs" items={ex.liabilities?.items} total={ex.liabilities?.total_stated} />
          </>
        )}
        {ex.document_type === "revenue_list" && (
          <table style={tableStyle}><thead><tr><th style={thStyle}>Client</th><th style={thStyle}>CA</th><th style={thStyle}>%</th></tr></thead>
            <tbody>
              {(ex.clients || []).map((c, i) => <tr key={i}><td style={tdStyle}>{c.name}</td><td style={tdStyle}>{fmtNum(c.revenue)}</td><td style={tdStyle}>{c.percentage?.toFixed(1)}%</td></tr>)}
              <tr style={{ fontWeight: 700 }}><td style={tdStyle}>TOTAL</td><td style={tdStyle}>{fmtNum(ex.total_stated)}</td><td style={tdStyle}>100%</td></tr>
            </tbody></table>
        )}
        {ex.document_type === "payroll" && (
          <table style={tableStyle}><thead><tr><th style={thStyle}>Nom</th><th style={thStyle}>Poste</th><th style={thStyle}>Brut</th><th style={thStyle}>Net</th></tr></thead>
            <tbody>
              {(ex.employees || []).map((e, i) => <tr key={i}><td style={tdStyle}>{e.name}</td><td style={tdStyle}>{e.role}</td><td style={tdStyle}>{fmtNum(e.gross_salary)}</td><td style={tdStyle}>{fmtNum(e.net_salary)}</td></tr>)}
              <tr style={{ fontWeight: 700 }}><td style={tdStyle}>TOTAL</td><td style={tdStyle}></td><td style={tdStyle}>{fmtNum(ex.total_gross_stated)}</td><td style={tdStyle}></td></tr>
            </tbody></table>
        )}

        {data.validation_notes && (
          <div style={{ marginTop: 16, padding: 12, background: data.validation_passed ? "#F0FFF4" : "#FEF2F2", borderRadius: 8, fontSize: 12 }}>
            <strong>Validation:</strong> {data.validation_notes}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewTable({ title, items, total }) {
  const fmtNum = (v) => v != null ? Number(v).toLocaleString("fr-FR") : "—";
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, marginBottom: 4 }}>{title}</div>
      <table style={tableStyle}><tbody>
        {items.map((item, i) => <tr key={i}><td style={tdStyle}>{item.label}</td><td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(item.amount)}</td></tr>)}
        <tr style={{ fontWeight: 700, background: "#F7FAFC" }}><td style={tdStyle}>TOTAL</td><td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(total)}</td></tr>
      </tbody></table>
    </div>
  );
}

function KPIBox({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 120, background: "#F7FAFC", borderRadius: 8, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{value}</div>
    </div>
  );
}

const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thStyle = { textAlign: "left", padding: "6px 8px", borderBottom: `2px solid ${NAVY}`, color: NAVY, fontSize: 12 };
const tdStyle = { padding: "5px 8px", borderBottom: "1px solid #F0F0F0" };

// ==================== COMPARE TAB ====================
function CompareTab({ documents }) {
  const financials = documents.filter((d) => d.document_type === "financial_statement" && d.status === "completed");
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleCompare() {
    if (!idA || !idB) return;
    setLoading(true);
    try {
      const res = await api(`/api/documents/compare?idA=${idA}&idB=${idB}`);
      const data = await res.json();
      if (res.ok) setResult(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function handleExport() {
    const res = await api("/api/documents/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idA, idB }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "comparaison-N-vs-N1.xlsx"; a.click();
    }
  }

  const fmtNum = (v) => v != null ? Number(v).toLocaleString("fr-FR") : "—";
  const delta = (a, b) => { if (a == null || b == null) return "—"; const d = b - a; return (d >= 0 ? "+" : "") + d.toLocaleString("fr-FR"); };

  return (
    <Card>
      <h3 style={{ margin: "0 0 16px", color: NAVY }}>Comparaison N vs N-1</h3>
      {financials.length < 2 ? (
        <div style={{ color: "#999" }}>Il faut au moins 2 bilans financiers complétés pour comparer.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={idA} onChange={(e) => setIdA(e.target.value)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #D0DAE8", fontSize: 13 }}>
              <option value="">Sélectionner N-1</option>
              {financials.map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
            </select>
            <select value={idB} onChange={(e) => setIdB(e.target.value)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #D0DAE8", fontSize: 13 }}>
              <option value="">Sélectionner N</option>
              {financials.map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
            </select>
            <button onClick={handleCompare} disabled={!idA || !idB || loading} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: NAVY, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {loading ? "..." : "Comparer"}
            </button>
          </div>
          {result && (
            <>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Métrique</th><th style={thStyle}>N-1</th><th style={thStyle}>N</th><th style={thStyle}>Variation</th></tr></thead>
                <tbody>
                  {["revenue", "expenses", "ebitda", "net_income", "assets", "liabilities"].map((k) => (
                    <tr key={k}>
                      <td style={tdStyle}>{k}</td>
                      <td style={tdStyle}>{fmtNum(result.docA.metrics[k])}</td>
                      <td style={tdStyle}>{fmtNum(result.docB.metrics[k])}</td>
                      <td style={{ ...tdStyle, color: (result.docB.metrics[k] || 0) >= (result.docA.metrics[k] || 0) ? GREEN : RED, fontWeight: 600 }}>
                        {delta(result.docA.metrics[k], result.docB.metrics[k])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={handleExport} style={{ marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "none", background: GREEN, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                Exporter Excel
              </button>
            </>
          )}
        </>
      )}
    </Card>
  );
}

// ==================== COMBINED TAB ====================
function CombinedTab({ documents }) {
  const completed = documents.filter((d) => d.status === "completed");
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  function toggle(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev);
  }

  async function handleExport() {
    setLoading(true);
    try {
      const res = await api("/api/documents/combined", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docIds: selected }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "rapport-combine.xlsx"; a.click();
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  return (
    <Card>
      <h3 style={{ margin: "0 0 8px", color: NAVY }}>Rapport combiné</h3>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>Sélectionnez jusqu'à 5 documents pour fusionner en un Excel multi-onglets.</p>
      {completed.length === 0 ? <div style={{ color: "#999" }}>Aucun document complété.</div> : (
        <>
          {completed.map((doc) => (
            <label key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #F0F0F0", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={selected.includes(doc.id)} onChange={() => toggle(doc.id)} />
              <span style={{ fontWeight: 500 }}>{doc.filename}</span>
              <span style={{ color: "#999", fontSize: 12 }}>{doc.document_type}</span>
            </label>
          ))}
          <button onClick={handleExport} disabled={selected.length === 0 || loading}
            style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, border: "none", background: selected.length > 0 ? GREEN : "#CCC", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            {loading ? "Génération..." : `Exporter ${selected.length} doc(s)`}
          </button>
        </>
      )}
    </Card>
  );
}

// ==================== BATCH PAYSLIPS TAB ====================
function BatchTab({ onDone }) {
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleBatch() {
    if (!files?.length) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files[]", f);
      const res = await api("/api/documents/batch-payroll", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch échoué");
      setResult(data);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h3 style={{ margin: "0 0 16px", color: NAVY }}>Batch Bulletins de Paie</h3>
      <input type="file" accept=".pdf" multiple onChange={(e) => setFiles(e.target.files)}
        style={{ padding: 10, border: "1.5px dashed #D0DAE8", borderRadius: 8, marginBottom: 12, display: "block" }} />
      <button onClick={handleBatch} disabled={!files?.length || loading}
        style={{ padding: "12px 24px", background: loading ? "#9BB0C7" : GREEN, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
        {loading ? "Traitement..." : `Traiter ${files?.length || 0} fichier(s)`}
      </button>
      {error && <div style={{ marginTop: 12, padding: 12, background: "#FEF2F2", borderRadius: 8, color: RED, fontSize: 13 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 16, padding: 16, background: "#F0FFF4", border: "1px solid #C6F6D5", borderRadius: 8, fontSize: 13 }}>
          <strong>{result.employees_merged} employés</strong> fusionnés depuis {result.files_processed} fichier(s).
          {result.errors?.length > 0 && <div style={{ color: ORANGE, marginTop: 4 }}>Erreurs: {result.errors.join(", ")}</div>}
        </div>
      )}
    </Card>
  );
}

// ==================== CHECKLIST TAB ====================
const MA_CHECKLIST = [
  { cat: "Financier", items: ["États financiers audités (3 ans)", "Prévisions budgétaires", "Détail du chiffre d'affaires par client", "Analyse de la marge brute", "Détail des charges d'exploitation", "Tableau de flux de trésorerie", "Détail de l'endettement"] },
  { cat: "Juridique", items: ["Statuts à jour", "PV d'assemblées générales", "Contrats commerciaux majeurs", "Contentieux en cours", "Propriété intellectuelle"] },
  { cat: "Social / RH", items: ["Registre du personnel", "Contrats de travail types", "Convention collective applicable", "Masse salariale détaillée", "Turnover et absentéisme"] },
  { cat: "Fiscal", items: ["Liasses fiscales (3 ans)", "Crédits d'impôt (CIR/CII)", "Contrôles fiscaux passés", "TVA — conformité"] },
  { cat: "Opérationnel", items: ["Liste des fournisseurs clés", "Contrats de bail", "Assurances", "Systèmes IT et licences"] },
];

function ChecklistTab() {
  const [checks, setChecks] = useState(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("dc_checklist") || "{}"); } catch { return {}; }
  });

  function toggle(key) {
    const next = { ...checks, [key]: !checks[key] };
    setChecks(next);
    localStorage.setItem("dc_checklist", JSON.stringify(next));
  }

  const total = MA_CHECKLIST.reduce((a, c) => a + c.items.length, 0);
  const done = Object.values(checks).filter(Boolean).length;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: NAVY }}>Checklist Due Diligence M&A</h3>
        <span style={{ fontSize: 13, color: "#666" }}>{done}/{total} complété</span>
      </div>
      <div style={{ height: 6, background: "#E2E8F0", borderRadius: 3, marginBottom: 20 }}>
        <div style={{ height: 6, background: GREEN, borderRadius: 3, width: `${(done / total) * 100}%`, transition: "width 0.3s" }} />
      </div>
      {MA_CHECKLIST.map((cat) => (
        <div key={cat.cat} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 6 }}>{cat.cat}</div>
          {cat.items.map((item) => {
            const key = `${cat.cat}::${item}`;
            return (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={!!checks[key]} onChange={() => toggle(key)} />
                <span style={{ textDecoration: checks[key] ? "line-through" : "none", color: checks[key] ? "#AAA" : "#333" }}>{item}</span>
              </label>
            );
          })}
        </div>
      ))}
    </Card>
  );
}

// ==================== TEAM TAB ====================
function TeamTab() {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    const res = await api("/api/auth/invite");
    if (res.ok) { const data = await res.json(); setMembers(data.members || []); }
  }, []);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  async function invite() {
    if (!email || !name) return;
    setLoading(true); setMsg("");
    try {
      const res = await api("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`Invité! Mot de passe temporaire: ${data.temp_password}`);
      setEmail(""); setName("");
      loadMembers();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeMember(userId) {
    await api("/api/auth/invite", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    loadMembers();
  }

  return (
    <Card>
      <h3 style={{ margin: "0 0 16px", color: NAVY }}>Équipe</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #D0DAE8", fontSize: 13, minWidth: 120 }} />
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #D0DAE8", fontSize: 13, minWidth: 180 }} />
        <button onClick={invite} disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: GREEN, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
          Inviter
        </button>
      </div>
      {msg && <div style={{ marginBottom: 12, padding: 10, background: "#F0FFF4", borderRadius: 8, fontSize: 12 }}>{msg}</div>}
      {members.map((m) => (
        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0F0F0" }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{m.full_name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{m.email}</div>
          </div>
          <button onClick={() => removeMember(m.id)}
            style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#FEF2F2", color: RED, fontSize: 12, cursor: "pointer" }}>
            Retirer
          </button>
        </div>
      ))}
    </Card>
  );
}

// ==================== MAIN DASHBOARD ====================
const TABS = [
  { key: "upload", label: "Upload" },
  { key: "documents", label: "Documents" },
  { key: "compare", label: "N vs N-1" },
  { key: "combined", label: "Combined Report" },
  { key: "batch", label: "Batch Payslips" },
  { key: "checklist", label: "Checklist" },
  { key: "team", label: "Team" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState("upload");
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await api("/api/auth/me");
      if (!res.ok) throw new Error("Auth failed");
      const data = await res.json();
      setUser(data.user);
      setSubscription(data.subscription);
      setDocuments(data.documents || []);
    } catch {
      localStorage.removeItem("dc_token");
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = typeof window !== "undefined" && localStorage.getItem("dc_token");
    if (!token) { router.replace("/login"); return; }
    loadData();
  }, [router, loadData]);

  function signOut() {
    localStorage.removeItem("dc_token");
    router.replace("/login");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{ width: 40, height: 40, border: "4px solid #1B2A4A", borderTopColor: "#3DAA5C", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG }}>
      <Header user={user} subscription={subscription} onSignOut={signOut} />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ padding: "24px", maxWidth: 960, margin: "0 auto" }}>
        {tab === "upload" && <UploadTab onDone={loadData} />}
        {tab === "documents" && <DocumentsTab documents={documents} onRefresh={loadData} />}
        {tab === "compare" && <CompareTab documents={documents} />}
        {tab === "combined" && <CombinedTab documents={documents} />}
        {tab === "batch" && <BatchTab onDone={loadData} />}
        {tab === "checklist" && <ChecklistTab />}
        {tab === "team" && <TeamTab />}
      </div>
    </div>
  );
}
