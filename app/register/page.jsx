"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const NAVY = "#1B2A4A", GREEN = "#3DAA5C";

export default function Register() {
  const [form, setForm] = useState({ email: "", password: "", full_name: "", organization_name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/auth/register", {
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
        <h2 style={s.title}>Create Account</h2>
        <p style={s.sub}>99€/month — 100 documents included</p>
        {error && <div style={s.err}>{error}</div>}
        <form onSubmit={handleSubmit}>
          {[
            ["full_name","Full Name","text","John Smith"],
            ["organization_name","Company Name","text","Acme Corp"],
            ["email","Email","email","you@company.com"],
            ["password","Password","password","Min. 8 characters"],
          ].map(([k,l,t,p]) => (
            <div key={k} style={s.field}>
              <label style={s.label}>{l}</label>
              <input style={s.input} type={t} placeholder={p} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} required />
            </div>
          ))}
          <button style={s.btn} type="submit" disabled={loading}>{loading?"Creating account...":"Start Free Trial"}</button>
        </form>
        <p style={s.sw}>Already have an account? <Link href="/login" style={{color:GREEN}}>Sign in</Link></p>
      </div>
    </div>
  );
}

const s = {
  page:{minHeight:"100vh",background:"#F0F4F8",display:"flex",alignItems:"center",justifyContent:"center"},
  card:{background:"#fff",borderRadius:12,padding:"40px 48px",width:440,boxShadow:"0 4px 24px rgba(27,42,74,0.12)"},
  logo:{textAlign:"center",marginBottom:20},
  logoText:{display:"block",fontSize:28,fontWeight:800,color:NAVY},
  tag:{display:"block",fontSize:11,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1.5,marginTop:4},
  title:{fontSize:20,fontWeight:700,color:NAVY,marginBottom:4,textAlign:"center"},
  sub:{fontSize:13,color:"#6B7A99",textAlign:"center",marginBottom:20},
  err:{background:"#FDECEA",color:"#C0392B",borderRadius:6,padding:"10px 14px",marginBottom:16,fontSize:14},
  field:{marginBottom:16},
  label:{display:"block",fontSize:13,fontWeight:600,color:NAVY,marginBottom:6},
  input:{width:"100%",padding:"10px 12px",border:"1.5px solid #DEE2E6",borderRadius:7,fontSize:14,outline:"none",boxSizing:"border-box"},
  btn:{width:"100%",padding:"12px",background:NAVY,color:"#fff",border:"none",borderRadius:7,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8},
  sw:{textAlign:"center",marginTop:20,fontSize:13,color:"#6B7A99"},
};
