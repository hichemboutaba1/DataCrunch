"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const NAVY = "#1B2A4A", GREEN = "#3DAA5C", RED = "#C0392B", YELLOW = "#F39C12";
const TYPES = [
  { value: "financial_statement", label: "Financial Statement" },
  { value: "revenue_list", label: "Revenue per Client" },
  { value: "payroll", label: "Payroll" },
];

function api(url, opts = {}) {
  const token = localStorage.getItem("token");
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...opts.headers } });
}

export default function Dashboard() {
  const [state, setState] = useState({ user: null, subscription: null, docs: [] });
  const [docType, setDocType] = useState("financial_statement");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef();
  const router = useRouter();

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await api("/api/auth/me");
    if (!res.ok) { router.replace("/login"); return; }
    const data = await res.json();
    setState({ user: data.user, subscription: data.subscription, docs: data.recent_documents || [] });
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!fileRef.current.files[0]) return setError("Please select a PDF file");
    setUploading(true); setError(""); setProgress("Uploading & analyzing...");
    const form = new FormData();
    form.append("file", fileRef.current.files[0]);
    form.append("document_type", docType);
    const res = await api("/api/documents/upload", { method: "POST", body: form });
    const data = await res.json();
    setUploading(false); setProgress(""); setSelectedFile(null); fileRef.current.value = "";
    if (!res.ok) { setError(data.error || "Upload failed"); } else { load(); }
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

  const { user, subscription, docs } = state;
  const usedPct = subscription ? Math.min(100, (subscription.documents_used / subscription.monthly_quota) * 100) : 0;
  const qColor = usedPct >= 100 ? RED : usedPct >= 80 ? YELLOW : GREEN;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.hl}><span style={s.logo}>DataCrunch</span><span style={s.tag}>M&A Financial Analysis Automated.</span></div>
        <div style={s.hr}>
          {user && <span style={s.email}>{user.email}</span>}
          <button style={s.logout} onClick={() => { localStorage.removeItem("token"); router.push("/login"); }}>Sign Out</button>
        </div>
      </header>

      <div style={s.content}>
        {subscription && (
          <div style={s.card}>
            <div style={s.usageTitle}>MONTHLY USAGE</div>
            <div style={s.usageRow}>
              <span style={{ color: qColor, fontWeight: 700, fontSize: 28 }}>{subscription.documents_used}</span>
              <span style={s.usageOf}>/ {subscription.monthly_quota} documents</span>
            </div>
            <div style={s.bar}><div style={{ ...s.fill, width: `${usedPct}%`, background: qColor }} /></div>
            <div style={s.usageFoot}>
              {subscription.documents_used < subscription.monthly_quota
                ? <span style={{ color: GREEN }}>{subscription.monthly_quota - subscription.documents_used} remaining</span>
                : <span style={{ color: RED }}>Over quota — 1€ per additional document</span>}
              <span style={{ color: "#6B7A99", marginLeft: 16 }}>Status: {subscription.status}</span>
            </div>
          </div>
        )}

        <div style={s.card}>
          <h2 style={s.sectionTitle}>Upload Financial Document</h2>
          {error && <div style={s.err}>{error}</div>}
          {progress && <div style={s.prog}>⏳ {progress}</div>}
          <form onSubmit={handleUpload}>
            <div style={s.types}>
              {TYPES.map(t => (
                <button key={t.value} type="button"
                  style={{ ...s.typeBtn, ...(docType === t.value ? s.typeBtnOn : {}) }}
                  onClick={() => setDocType(t.value)}>{t.label}</button>
              ))}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={s.fileLabel}>
                <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
                  onChange={e => setSelectedFile(e.target.files[0]?.name || null)} />
                <span style={s.fileBtn}>{selectedFile ? `📄 ${selectedFile}` : "Choose PDF File"}</span>
              </label>
            </div>
            <button style={s.uploadBtn} type="submit" disabled={uploading}>
              {uploading ? "Analyzing..." : "Upload & Analyze"}
            </button>
          </form>
        </div>

        <div style={s.card}>
          <h2 style={s.sectionTitle}>Recent Documents</h2>
          {docs.length === 0
            ? <p style={{ color: "#6B7A99", textAlign: "center", padding: "32px 0" }}>No documents yet.</p>
            : <table style={s.table}>
                <thead><tr>{["File","Type","Status","Validation","Date","Download"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {docs.map(doc => (
                    <tr key={doc.id} style={s.tr}>
                      <td style={s.td}>{doc.filename}</td>
                      <td style={s.td}>{doc.document_type?.replace("_"," ")}</td>
                      <td style={s.td}><StatusBadge status={doc.status} /></td>
                      <td style={s.td}>
                        {doc.validation_passed === null ? "—"
                          : doc.validation_passed
                            ? <span style={{ color: GREEN }}>✅ OK</span>
                            : <span style={{ color: RED }}>⚠️ Mismatch</span>}
                      </td>
                      <td style={s.td}>{new Date(doc.created_at).toLocaleDateString()}</td>
                      <td style={s.td}>
                        {doc.status === "completed" && (
                          <button style={s.dlBtn} onClick={() => handleDownload(doc.id, doc.filename)}>Excel</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const m = { pending:{bg:"#EEF2F7",c:"#6B7A99",l:"Pending"}, processing:{bg:"#FFF3CD",c:"#856404",l:"Processing..."}, completed:{bg:"#D4EDDA",c:"#155724",l:"Completed"}, failed:{bg:"#FDECEA",c:"#C0392B",l:"Failed"} };
  const x = m[status] || m.pending;
  return <span style={{ background: x.bg, color: x.c, borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{x.l}</span>;
}

const s = {
  page:{minHeight:"100vh",background:"#F0F4F8"},
  header:{background:NAVY,padding:"0 32px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between"},
  hl:{display:"flex",alignItems:"baseline",gap:12},
  logo:{color:"#fff",fontWeight:800,fontSize:22},
  tag:{color:"#8FA3C0",fontSize:11,textTransform:"uppercase",letterSpacing:1.5},
  hr:{display:"flex",alignItems:"center",gap:16},
  email:{color:"#8FA3C0",fontSize:13},
  logout:{background:"transparent",border:"1px solid #8FA3C0",color:"#fff",padding:"5px 14px",borderRadius:6,cursor:"pointer",fontSize:13},
  content:{maxWidth:1100,margin:"0 auto",padding:"32px 24px"},
  card:{background:"#fff",borderRadius:12,padding:"24px 28px",marginBottom:24,boxShadow:"0 2px 12px rgba(27,42,74,0.08)"},
  usageTitle:{fontSize:12,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8},
  usageRow:{display:"flex",alignItems:"baseline",gap:8,marginBottom:12},
  usageOf:{color:"#6B7A99",fontSize:16},
  bar:{height:8,background:"#F0F4F8",borderRadius:4,overflow:"hidden",marginBottom:8},
  fill:{height:"100%",borderRadius:4,transition:"width 0.4s"},
  usageFoot:{fontSize:13},
  sectionTitle:{fontSize:18,fontWeight:700,color:NAVY,marginBottom:16,marginTop:0},
  err:{background:"#FDECEA",color:RED,borderRadius:6,padding:"10px 14px",marginBottom:14,fontSize:14},
  prog:{background:"#FFF3CD",color:"#856404",borderRadius:6,padding:"10px 14px",marginBottom:14,fontSize:14},
  types:{display:"flex",gap:8,marginBottom:16},
  typeBtn:{padding:"8px 16px",border:"1.5px solid #DEE2E6",borderRadius:7,cursor:"pointer",fontSize:13,background:"#fff",color:"#6B7A99",fontWeight:600},
  typeBtnOn:{borderColor:NAVY,background:NAVY,color:"#fff"},
  fileLabel:{cursor:"pointer"},
  fileBtn:{display:"inline-block",padding:"10px 20px",border:"2px dashed #DEE2E6",borderRadius:8,color:"#6B7A99",fontSize:14},
  uploadBtn:{padding:"11px 28px",background:GREEN,color:"#fff",border:"none",borderRadius:7,fontSize:15,fontWeight:700,cursor:"pointer"},
  table:{width:"100%",borderCollapse:"collapse",fontSize:13},
  th:{background:"#F0F4F8",color:NAVY,fontWeight:700,padding:"10px 14px",textAlign:"left",borderBottom:"2px solid #DEE2E6"},
  tr:{borderBottom:"1px solid #F0F4F8"},
  td:{padding:"10px 14px",color:"#3D4B66",verticalAlign:"middle"},
  dlBtn:{padding:"5px 14px",background:NAVY,color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700},
};
