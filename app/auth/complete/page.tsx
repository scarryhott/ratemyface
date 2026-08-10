"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

export default function AuthCompletePage() {
  const [status, setStatus] = useState("Completing sign in…");

  useEffect(() => {
    void (async () => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
        if (!url || !key) throw new Error("Supabase browser authentication is not configured.");
        const supabase = createClient(url, key, { auth:{ flowType:"pkce", persistSession:true, detectSessionInUrl:true } });
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const nextRaw = params.get("next") || "/operator";
        const next = nextRaw.startsWith("/") ? nextRaw : "/operator";

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const accessToken = data.session?.access_token;
        if (!accessToken) throw new Error("No authenticated Supabase session was returned.");

        const response = await fetch("/api/operator/owner/session", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ access_token:accessToken })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(body?.error || "owner_session_failed"));
        setStatus("Authenticated. Redirecting…");
        window.location.replace(next);
      } catch (error) {
        setStatus(`Sign-in failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, []);

  return <main><h1>Operator Authentication</h1><p>{status}</p></main>;
}
