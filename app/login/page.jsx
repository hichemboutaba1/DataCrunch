"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const NAVY = "#1B2A4A", GREEN = "#3DAA5C";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    localStorage.setItem("token", data.access_token);
    router.push("/dashboard");
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}><span style={s.logoText}>DataCrunch</span><span style={s.tag}>M&A Financial Analysis Automated.</span></div>
        <h2 style={s.title}>Sign In</h2>
        {error && <div style={s.err}>{error}</div>}
        <form onSubmit={handleSubmit}>
          {[["email","Email","email","you@company.com"],["password","Password","password","••••••••"]].map(([k,l,t,p]) => (
            <div key={k} style={s.field}>
              <label style={s.label}>{l}</label>
              <input style={s.input} type={t} placeholder={p} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} required />
            </div>
          ))}
          <button style={s.btn} type="submit" disabled={loading}>{loading?"Signing in...":"Sign In"}</button>
        </form>
        <p style={s.sw}>No account? <Link href="/register" style={{color:GREEN}}>Create one</Link></p>
      </div>
    </div>
  );
}

const s = {
  page:{minHeight:"100vh",background:"#F0F4F8",display:"flex",alignItems:"center",justifyContent:"center"},
  card:{background:"#fff",borderRadius:12,padding:"40px 48px",width:420,boxShadow:"0 4px 24px rgba(27,42,74,0.12)"},
  logo:{textAlign:"center",marginBottom:24},
  logoText:{display:"block",fontSize:28,fontWeight:800,color:NAVY},
  tag:{display:"block",fontSize:11,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1.5,marginTop:4},
  title:{fontSize:20,fontWeight:700,color:NAVY,marginBottom:24,textAlign:"center"},
  err:{background:"#FDECEA",color:"#C0392B",borderRadius:6,padding:"10px 14px",marginBottom:16,fontSize:14},
  field:{marginBottom:18},
  label:{display:"block",fontSize:13,fontWeight:600,color:NAVY,marginBottom:6},
  input:{width:"100%",padding:"10px 12px",border:"1.5px solid #DEE2E6",borderRadius:7,fontSize:14,outline:"none",boxSizing:"border-box"},
  btn:{width:"100%",padding:"12px",background:NAVY,color:"#fff",border:"none",borderRadius:7,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8},
  sw:{textAlign:"center",marginTop:20,fontSize:13,color:"#6B7A99"},
};
