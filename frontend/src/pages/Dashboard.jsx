import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/client";

const NAVY = "#1B2A4A";
const GREEN = "#3DAA5C";
const RED = "#C0392B";
const YELLOW = "#F39C12";

const DOC_TYPES = [
  { value: "financial_statement", label: "Financial Statement" },
  { value: "revenue_list", label: "Revenue per Client" },
  { value: "payroll", label: "Payroll" },
];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [docType, setDocType] = useState("financial_statement");
  const [error, setError] = useState("");
  const fileRef = useRef();
  const navigate = useNavigate();
  const pollingRef = useRef({});

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await API.get("/documents/dashboard");
      setUser(res.data.user);
      setSubscription(res.data.subscription);
      setDocuments(res.data.recent_documents || []);
    } catch {
      navigate("/login");
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return setError("Please select a PDF file");
    if (!file.name.endsWith(".pdf")) return setError("Only PDF files accepted");

    setUploading(true);
    setError("");
    setUploadProgress("Uploading...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_type", docType);

    try {
      const res = await API.post("/documents/upload", formData);
      const docId = res.data.id;
      setUploadProgress("Processing with AI...");
      fileRef.current.value = "";
      pollStatus(docId);
    } catch (err) {
      const msg = err.response?.data?.detail || "Upload failed";
      setError(msg);
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  };

  const pollStatus = (docId) => {
    pollingRef.current[docId] = setInterval(async () => {
      try {
        const res = await API.get(`/documents/${docId}/status`);
        const status = res.data.status;

        if (status === "completed" || status === "failed") {
          clearInterval(pollingRef.current[docId]);
          setUploadProgress(null);
          loadDashboard();
        } else {
          setUploadProgress(status === "processing" ? "AI extracting data..." : "Processing...");
        }
      } catch {
        clearInterval(pollingRef.current[docId]);
        setUploadProgress(null);
      }
    }, 2000);
  };

  const handleDownload = async (docId, filename) => {
    try {
      const res = await API.get(`/documents/${docId}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.replace(".pdf", ".xlsx");
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Download failed — document may not be ready yet");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const usedPct = subscription
    ? Math.min(100, (subscription.documents_used / subscription.monthly_quota) * 100)
    : 0;
  const quotaColor = usedPct >= 100 ? RED : usedPct >= 80 ? YELLOW : GREEN;

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logoText}>DataCrunch</span>
          <span style={styles.tagline}>M&A Financial Analysis Automated.</span>
        </div>
        <div style={styles.headerRight}>
          {user && <span style={styles.userEmail}>{user.email}</span>}
          <button style={styles.logoutBtn} onClick={logout}>Sign Out</button>
        </div>
      </header>

      <div style={styles.content}>
        {/* Usage card */}
        {subscription && (
          <div style={styles.usageCard}>
            <div style={styles.usageTitle}>Monthly Usage</div>
            <div style={styles.usageNumbers}>
              <span style={{ color: quotaColor, fontWeight: 700, fontSize: 28 }}>
                {subscription.documents_used}
              </span>
              <span style={styles.usageOf}>/ {subscription.monthly_quota} documents</span>
            </div>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${usedPct}%`, background: quotaColor }} />
            </div>
            <div style={styles.usageFooter}>
              {subscription.documents_remaining > 0
                ? <span style={{ color: GREEN }}>{subscription.documents_remaining} remaining this month</span>
                : <span style={{ color: RED }}>Over quota — 1€ per additional document</span>
              }
              <span style={{ color: "#6B7A99", marginLeft: 16 }}>Status: {subscription.status}</span>
            </div>
          </div>
        )}

        {/* Upload section */}
        <div style={styles.uploadCard}>
          <h2 style={styles.sectionTitle}>Upload Financial Document</h2>
          {error && <div style={styles.error}>{error}</div>}
          {uploadProgress && (
            <div style={styles.progressMsg}>
              <span style={styles.spinner} /> {uploadProgress}
            </div>
          )}
          <form onSubmit={handleUpload} style={styles.uploadForm}>
            <div style={styles.typeSelect}>
              {DOC_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  style={{ ...styles.typeBtn, ...(docType === t.value ? styles.typeBtnActive : {}) }}
                  onClick={() => setDocType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label style={styles.fileLabel}>
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} />
              <span style={styles.fileBtn}>Choose PDF File</span>
            </label>
            <button style={styles.uploadBtn} type="submit" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload & Analyze"}
            </button>
          </form>
        </div>

        {/* Documents list */}
        <div style={styles.tableCard}>
          <h2 style={styles.sectionTitle}>Recent Documents</h2>
          {documents.length === 0 ? (
            <p style={styles.empty}>No documents yet. Upload your first PDF above.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  {["File", "Type", "Status", "Validation", "Overage", "Date", "Download"].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={styles.tr}>
                    <td style={styles.td}>{doc.filename}</td>
                    <td style={styles.td}>{doc.document_type.replace("_", " ")}</td>
                    <td style={styles.td}>
                      <StatusBadge status={doc.status} />
                    </td>
                    <td style={styles.td}>
                      {doc.validation_passed === null ? "—" :
                        doc.validation_passed
                          ? <span style={{ color: GREEN }}>✅ OK</span>
                          : <span style={{ color: RED }}>⚠️ Mismatch</span>
                      }
                    </td>
                    <td style={styles.td}>
                      {doc.is_overage ? <span style={{ color: YELLOW }}>+1€</span> : "—"}
                    </td>
                    <td style={styles.td}>{new Date(doc.created_at).toLocaleDateString()}</td>
                    <td style={styles.td}>
                      {doc.status === "completed" && (
                        <button
                          style={styles.dlBtn}
                          onClick={() => handleDownload(doc.id, doc.filename)}
                        >
                          Excel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: { bg: "#EEF2F7", color: "#6B7A99", label: "Pending" },
    processing: { bg: "#FFF3CD", color: "#856404", label: "Processing..." },
    completed: { bg: "#D4EDDA", color: "#155724", label: "Completed" },
    failed: { bg: "#FDECEA", color: "#C0392B", label: "Failed" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F0F4F8", fontFamily: "'Segoe UI', Calibri, sans-serif" },
  header: { background: NAVY, padding: "0 32px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "baseline", gap: 12 },
  logoText: { color: "#fff", fontWeight: 800, fontSize: 22, letterSpacing: -0.5 },
  tagline: { color: "#8FA3C0", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5 },
  headerRight: { display: "flex", alignItems: "center", gap: 16 },
  userEmail: { color: "#8FA3C0", fontSize: 13 },
  logoutBtn: { background: "transparent", border: "1px solid #8FA3C0", color: "#fff", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13 },
  content: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px" },
  usageCard: { background: "#fff", borderRadius: 12, padding: "24px 28px", marginBottom: 24, boxShadow: "0 2px 12px rgba(27,42,74,0.08)" },
  usageTitle: { fontSize: 12, fontWeight: 700, color: "#6B7A99", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 },
  usageNumbers: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 },
  usageOf: { color: "#6B7A99", fontSize: 16 },
  progressBar: { height: 8, background: "#F0F4F8", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  progressFill: { height: "100%", borderRadius: 4, transition: "width 0.4s ease" },
  usageFooter: { fontSize: 13 },
  uploadCard: { background: "#fff", borderRadius: 12, padding: "24px 28px", marginBottom: 24, boxShadow: "0 2px 12px rgba(27,42,74,0.08)" },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 16, marginTop: 0 },
  error: { background: "#FDECEA", color: RED, borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 14 },
  progressMsg: { display: "flex", alignItems: "center", gap: 8, color: "#856404", background: "#FFF3CD", borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 14 },
  spinner: { display: "inline-block", width: 14, height: 14, border: "2px solid #856404", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  uploadForm: { display: "flex", flexDirection: "column", gap: 16 },
  typeSelect: { display: "flex", gap: 8 },
  typeBtn: { padding: "8px 16px", border: "1.5px solid #DEE2E6", borderRadius: 7, cursor: "pointer", fontSize: 13, background: "#fff", color: "#6B7A99", fontWeight: 600 },
  typeBtnActive: { borderColor: NAVY, background: NAVY, color: "#fff" },
  fileLabel: { cursor: "pointer" },
  fileBtn: { display: "inline-block", padding: "10px 20px", border: "2px dashed #DEE2E6", borderRadius: 8, color: "#6B7A99", fontSize: 14, cursor: "pointer" },
  uploadBtn: { alignSelf: "flex-start", padding: "11px 28px", background: GREEN, color: "#fff", border: "none", borderRadius: 7, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  tableCard: { background: "#fff", borderRadius: 12, padding: "24px 28px", boxShadow: "0 2px 12px rgba(27,42,74,0.08)" },
  empty: { color: "#6B7A99", fontSize: 14, textAlign: "center", padding: "32px 0" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { background: "#F0F4F8", color: NAVY, fontWeight: 700, padding: "10px 14px", textAlign: "left", borderBottom: "2px solid #DEE2E6" },
  tr: { borderBottom: "1px solid #F0F4F8" },
  td: { padding: "10px 14px", color: "#3D4B66", verticalAlign: "middle" },
  dlBtn: { padding: "5px 14px", background: NAVY, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 },
};
