import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../api/client";

const NAVY = "#1B2A4A";
const GREEN = "#3DAA5C";

export default function Register() {
  const [form, setForm] = useState({ email: "", password: "", full_name: "", organization_name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await API.post("/auth/register", form);
      localStorage.setItem("token", res.data.access_token);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoText}>DataCrunch</span>
          <span style={styles.tagline}>M&A Financial Analysis Automated.</span>
        </div>

        <h2 style={styles.title}>Create Account</h2>
        <p style={styles.subtitle}>99€/month — 100 documents included</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {[
            { key: "full_name", label: "Full Name", type: "text", placeholder: "John Smith" },
            { key: "organization_name", label: "Company Name", type: "text", placeholder: "Acme Corp" },
            { key: "email", label: "Email", type: "email", placeholder: "you@company.com" },
            { key: "password", label: "Password", type: "password", placeholder: "Min. 8 characters" },
          ].map(({ key, label, type, placeholder }) => (
            <div style={styles.field} key={key}>
              <label style={styles.label}>{label}</label>
              <input
                style={styles.input}
                type={type}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required
                placeholder={placeholder}
              />
            </div>
          ))}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Start Free Trial"}
          </button>
        </form>

        <p style={styles.switch}>
          Already have an account? <Link to="/login" style={{ color: GREEN }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F0F4F8", display: "flex", alignItems: "center", justifyContent: "center" },
  card: { background: "#fff", borderRadius: 12, padding: "40px 48px", width: 440, boxShadow: "0 4px 24px rgba(27,42,74,0.12)" },
  logo: { textAlign: "center", marginBottom: 20 },
  logoText: { display: "block", fontSize: 28, fontWeight: 800, color: NAVY, letterSpacing: -0.5 },
  tagline: { display: "block", fontSize: 11, color: "#6B7A99", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 4 },
  title: { fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 4, textAlign: "center" },
  subtitle: { fontSize: 13, color: "#6B7A99", textAlign: "center", marginBottom: 20 },
  error: { background: "#FDECEA", color: "#C0392B", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 14 },
  field: { marginBottom: 16 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", border: "1.5px solid #DEE2E6", borderRadius: 7, fontSize: 14, outline: "none", boxSizing: "border-box" },
  btn: { width: "100%", padding: "12px", background: NAVY, color: "#fff", border: "none", borderRadius: 7, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8 },
  switch: { textAlign: "center", marginTop: 20, fontSize: 13, color: "#6B7A99" },
};
