"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("Supabase browser authentication is not configured.");
  return createClient(url, key, { auth: { flowType:"pkce", persistSession:true, detectSessionInUrl:true } });
}

export default function OperatorLoginPage() {
  const supabase = useMemo(() => browserClient(), []);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function bridge(accessToken: string) {
    const response = await fetch("/api/operator/owner/session", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ access_token:accessToken })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || "owner_session_failed"));
    window.location.assign("/operator");
  }

  async function run(fn: () => Promise<void>) {
    setLoading(true); setError(""); setMessage("");
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  async function google() {
    await run(async () => {
      const redirectTo = `${window.location.origin}/auth/complete?next=/operator`;
      const { error } = await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo } });
      if (error) throw error;
    });
  }

  async function sendOtp() {
    await run(async () => {
      if (!phone.trim()) throw new Error("Enter your owner phone number in international format, for example +1…");
      const { error } = await supabase.auth.signInWithOtp({ phone:phone.trim() });
      if (error) throw error;
      setOtpSent(true);
      setMessage("OTP sent. Enter the code from your phone.");
    });
  }

  async function verifyOtp() {
    await run(async () => {
      const { data, error } = await supabase.auth.verifyOtp({ phone:phone.trim(), token:otp.trim(), type:"sms" });
      if (error) throw error;
      if (!data.session?.access_token) throw new Error("Phone verification did not return a session.");
      await bridge(data.session.access_token);
    });
  }

  async function web3(chain: "ethereum" | "solana") {
    await run(async () => {
      const { data, error } = await supabase.auth.signInWithWeb3({
        chain,
        statement:"Authenticate as the owner of the Rate My Face Builder Operator. No transaction is requested."
      });
      if (error) throw error;
      if (!data.session?.access_token) throw new Error("Wallet signature did not return a session.");
      await bridge(data.session.access_token);
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("provider") === "google") void google();
    // Intentional one-shot provider bridge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <h1>Operator Sign In</h1>
      <p>Authenticate an allowlisted owner identity. Google, phone, Ethereum, and Solana are alternative identity proofs; none grants the agent access to unrelated accounts by itself.</p>

      <div className="card">
        <h2 style={{marginTop:0}}>Google</h2>
        <button onClick={google} disabled={loading} style={buttonStyle}>Continue with Google</button>
      </div>

      <div className="card">
        <h2 style={{marginTop:0}}>Phone</h2>
        <p>Requires a phone/SMS provider to be enabled in Supabase Auth.</p>
        <input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="+1 555 555 5555" autoComplete="tel" style={inputStyle}/>
        {!otpSent ? (
          <button onClick={sendOtp} disabled={loading} style={buttonStyle}>Send OTP</button>
        ) : (
          <>
            <input value={otp} onChange={(e)=>setOtp(e.target.value)} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" style={inputStyle}/>
            <button onClick={verifyOtp} disabled={loading} style={buttonStyle}>Verify phone</button>
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{marginTop:0}}>Web3 wallet</h2>
        <p>Signs an authentication message only. It does not request a blockchain transaction or expose the private key.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>web3("ethereum")} disabled={loading} style={buttonStyle}>Sign in with Ethereum</button>
          <button onClick={()=>web3("solana")} disabled={loading} style={secondaryButtonStyle}>Sign in with Solana</button>
        </div>
      </div>

      {message && <div className="card"><strong>{message}</strong></div>}
      {error && <div className="card" style={{borderColor:"#b42318"}}><strong>Sign-in error:</strong> {error}</div>}
    </main>
  );
}

const inputStyle: React.CSSProperties = { width:"100%", marginTop:8, padding:12, border:"1px solid #bbb", borderRadius:8 };
const buttonStyle: React.CSSProperties = { marginTop:12, padding:"10px 14px", border:"1px solid #111", borderRadius:8, background:"#111", color:"white", cursor:"pointer" };
const secondaryButtonStyle: React.CSSProperties = { ...buttonStyle, background:"white", color:"#111" };
