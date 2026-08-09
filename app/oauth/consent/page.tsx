"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function OAuthConsentPage() {
  const [status, setStatus] = useState("Loading authorization request…");
  const [email, setEmail] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [ready, setReady] = useState(false);

  const params = useMemo(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    return {
      clientId: q.get("client_id") || "",
      redirectUri: q.get("redirect_uri") || "",
      state: q.get("state") || "",
      scope: q.get("scope") || ""
    };
  }, []);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setStatus("Supabase public auth environment variables are not configured.");
        return;
      }
      if (!params?.clientId || !params.redirectUri) {
        setStatus("Missing OAuth authorization request.");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setNeedsLogin(true);
        setStatus("Sign in to approve access for Rate My Face.");
        return;
      }
      setNeedsLogin(false);
      setReady(true);
      setStatus("Review access and continue.");
    }
    load();
  }, [params, supabase]);

  async function sendMagicLink() {
    if (!supabase || !email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });
    setStatus(error ? error.message : "Check your email for the secure sign-in link, then return here.");
  }

  async function approve() {
    if (!supabase || !params) return;
    setStatus("Approving…");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setNeedsLogin(true);
      setStatus("Your sign-in session expired. Sign in again.");
      return;
    }
    const response = await fetch("/api/oauth/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supabase_access_token: token,
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        state: params.state,
        scope: params.scope
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.redirect_url) {
      setStatus(result.error || "Authorization failed.");
      return;
    }
    window.location.assign(result.redirect_url);
  }

  function deny() {
    if (!params?.redirectUri) return;
    const url = new URL(params.redirectUri);
    url.searchParams.set("error", "access_denied");
    if (params.state) url.searchParams.set("state", params.state);
    window.location.assign(url.toString());
  }

  return (
    <main>
      <h1>Rate My Face authorization</h1>
      <p>{status}</p>

      {needsLogin && (
        <div className="card">
          <h2>Sign in</h2>
          <p>Use a secure Supabase email magic link. Rate My Face never stores your password.</p>
          <input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ width: "100%", padding: 12, marginBottom: 12 }} />
          <button onClick={sendMagicLink}>Send sign-in link</button>
        </div>
      )}

      {ready && (
        <div className="card">
          <h2>Allow ChatGPT to access your Rate My Face account?</h2>
          <p>Requested scopes: {params?.scope || "profile"}</p>
          <p>This lets the GPT retrieve and save only your own Rate My Face personalization data.</p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={approve}>Allow</button>
            <button onClick={deny}>Deny</button>
          </div>
        </div>
      )}
    </main>
  );
}
