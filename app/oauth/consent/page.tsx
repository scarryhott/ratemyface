"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function OAuthConsentPage() {
  const [status, setStatus] = useState("Loading authorization request…");
  const [email, setEmail] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [details, setDetails] = useState<any>(null);

  const authorizationId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("authorization_id") || "";
  }, []);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) {
        setStatus("Supabase public auth environment variables are not configured.");
        return;
      }
      if (!authorizationId) {
        setStatus("Missing authorization request.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!cancelled) {
          setNeedsLogin(true);
          setStatus("Sign in to approve access for Rate My Face.");
        }
        return;
      }

      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (error) {
        if (!cancelled) setStatus(error.message);
        return;
      }
      if (!cancelled) {
        setDetails(data);
        setStatus("Review the requested access below.");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [authorizationId, supabase]);

  async function sendMagicLink() {
    if (!supabase || !email) return;
    const returnTo = window.location.href;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: returnTo }
    });
    setStatus(error ? error.message : "Check your email for the secure sign-in link, then return here.");
  }

  async function decide(approve: boolean) {
    if (!supabase || !authorizationId) return;
    setStatus(approve ? "Approving…" : "Denying…");
    const result = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }
    const redirectUrl = result.data?.redirect_url;
    if (redirectUrl) window.location.assign(redirectUrl);
  }

  return (
    <main>
      <h1>Rate My Face authorization</h1>
      <p>{status}</p>

      {needsLogin && (
        <div className="card">
          <h2>Sign in</h2>
          <p>Use a secure email magic link. No password is stored by Rate My Face.</p>
          <input
            aria-label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: "100%", padding: 12, marginBottom: 12 }}
          />
          <button onClick={sendMagicLink}>Send sign-in link</button>
        </div>
      )}

      {details && (
        <div className="card">
          <h2>Allow ChatGPT to access your Rate My Face account?</h2>
          <p>Requested scopes: {details.scope || "profile access"}</p>
          <p>This lets the GPT retrieve and save only your own Rate My Face personalization data.</p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => decide(true)}>Allow</button>
            <button onClick={() => decide(false)}>Deny</button>
          </div>
        </div>
      )}
    </main>
  );
}
