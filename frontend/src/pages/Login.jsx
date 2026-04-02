import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../api/client";

const NAVY = "#1B2A4A";
const GREEN = "#3DAA5C";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.append("username", form.email);
      params.append("password", form.password);
      const res = await API.post("/auth/login", params);
      localStorage.setItem("token", res.data.access_token);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed");
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

        <h2 style={styles.title}>Sign In</h2>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              placeholder="you@company.com"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              placeholder="••••••••"
            />
          </div>
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p style={styles.switch}>
          No account? <Link to="/register" style={{ color: GREEN }}>Create one</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F0F4F8", display: "flex", alignItems: "center", justifyContent: "center" },
  card: { background: "#fff", borderRadius: 12, padding: "40px 48px", width: 420, boxShadow: "0 4px 24px rgba(27,42,74,0.12)" },
  logo: { textAlign: "center", marginBottom: 24 },
  logoText: { display: "block", fontSize: 28, fontWeight: 800, color: NAVY, letterSpacing: -0.5 },
  tagline: { display: "block", fontSize: 11, color: "#6B7A99", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 4 },
  title: { fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 24, textAlign: "center" },
  error: { background: "#FDECEA", color: "#C0392B", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 14 },
  field: { marginBottom: 18 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", border: "1.5px solid #DEE2E6", borderRadius: 7, fontSize: 14, outline: "none", boxSizing: "border-box" },
  btn: { width: "100%", padding: "12px", background: NAVY, color: "#fff", border: "none", borderRadius: 7, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8 },
  switch: { textAlign: "center", marginTop: 20, fontSize: 13, color: "#6B7A99" },
};
