"use client";

import { useEffect, useState } from "react";

type Owner = {
  id: string;
  method: string;
  email?: string;
  phone?: string;
  wallet?: string;
};

type BrowserStatus = {
  active: boolean;
  expires_at?: string | null;
  persistent_profile?: boolean;
};

type BrowserSession = {
  viewer_url: string;
  vnc_password: string;
  expires_at: string;
  persistent_profile?: boolean;
};

async function json(response: Response) {
  const data = await response.json().catch(() => ({ ok: false, error: `HTTP_${response.status}` }));
  if (!response.ok) throw new Error(String(data?.error || `HTTP_${response.status}`));
  return data;
}

export default function OperatorBrowserPage() {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function control(action: "ownerStart" | "ownerStatus" | "ownerFinish", url?: string) {
    const response = await fetch("/api/operator/browser-control", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(url ? { url } : {}) })
    });
    return json(response);
  }

  async function refreshStatus() {
    const data = await control("ownerStatus");
    setStatus({
      active: Boolean(data.active),
      expires_at: data.expires_at || null,
      persistent_profile: Boolean(data.persistent_profile)
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/operator/owner", {
          credentials: "same-origin",
          cache: "no-store"
        });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setOwner(data.owner);
        const current = await control("ownerStatus");
        if (!cancelled) {
          setStatus({
            active: Boolean(current.active),
            expires_at: current.expires_at || null,
            persistent_profile: Boolean(current.persistent_profile)
          });
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startBrowser() {
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const data = await control("ownerStart", "https://chatgpt.com/");
      if (!data.viewer_url || !data.vnc_password) throw new Error("browser_viewer_missing");
      setSession({
        viewer_url: String(data.viewer_url),
        vnc_password: String(data.vnc_password),
        expires_at: String(data.expires_at),
        persistent_profile: true
      });
      setStatus({ active: true, expires_at: data.expires_at, persistent_profile: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  async function finishBrowser() {
    setLoading(true);
    setError("");
    try {
      await control("ownerFinish");
      setSession(null);
      setStatus({ active: false, expires_at: null, persistent_profile: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  async function copyPassword() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.vnc_password);
      setCopied(true);
    } catch {
      setError("Copy failed. Select the password manually.");
    }
  }

  const identity = owner?.email || owner?.phone || owner?.wallet || owner?.id;

  return (
    <main style={{ maxWidth: 1180 }}>
      <p><a href="/operator">← Builder Operator</a></p>
      <h1>Persistent Browser Login</h1>
      <p>
        This Vercel owner page opens the same Google Chrome profile that the MCP controls on Railway.
        Sign in inside the remote Chrome window once; the profile remains on the encrypted Railway volume
        after the temporary viewer closes.
      </p>

      {checking ? (
        <div className="card"><strong>Checking owner authentication…</strong></div>
      ) : !owner ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Owner authentication required</h2>
          <p>Authenticate with the allowlisted Google owner account before starting the browser viewer.</p>
          <a href="/auth/google?next=/operator/browser" style={buttonLinkStyle}>Continue with Google</a>
        </div>
      ) : (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Owner closure</h2>
            <p><strong>Signed in:</strong> {identity}</p>
            <p><strong>Method:</strong> {owner.method}</p>
            <p><strong>Railway profile:</strong> persistent</p>
            <p><strong>Interactive viewer:</strong> {status?.active ? "active" : "inactive"}</p>
            {status?.expires_at && <p><strong>Viewer expires:</strong> {new Date(status.expires_at).toLocaleString()}</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={startBrowser} disabled={loading} style={buttonStyle}>
                {status?.active ? "Replace viewer session" : "Start secure browser"}
              </button>
              <button onClick={() => void refreshStatus()} disabled={loading} style={secondaryButtonStyle}>
                Refresh status
              </button>
              {status?.active && (
                <button onClick={finishBrowser} disabled={loading} style={dangerButtonStyle}>
                  Finish viewer
                </button>
              )}
            </div>
          </div>

          {session && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Railway Chrome inside Vercel</h2>
              <p>
                The viewer lasts 15 minutes. Google and ChatGPT credentials are typed directly into Chrome;
                they are never submitted to this Vercel page.
              </p>
              <div style={passwordPanelStyle}>
                <div>
                  <div style={{ fontSize: 13, color: "#555" }}>noVNC password</div>
                  <code style={{ fontSize: 18, userSelect: "all" }}>{session.vnc_password}</code>
                </div>
                <button onClick={copyPassword} style={secondaryButtonStyle}>
                  {copied ? "Copied" : "Copy password"}
                </button>
              </div>
              <p>
                If the embedded viewer cannot connect, open the same temporary session in a top-level window.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <a href={session.viewer_url} target="_blank" rel="noreferrer" style={buttonLinkStyle}>
                  Open full-screen viewer
                </a>
                <button onClick={finishBrowser} disabled={loading} style={dangerButtonStyle}>
                  Finish and retain profile
                </button>
              </div>
              <iframe
                key={session.viewer_url}
                src={session.viewer_url}
                title="Persistent Railway Chrome"
                referrerPolicy="no-referrer"
                style={{
                  display: "block",
                  width: "100%",
                  height: "720px",
                  border: "1px solid #bbb",
                  borderRadius: 12,
                  background: "#111"
                }}
              />
            </div>
          )}
        </>
      )}

      {error && (
        <div className="card" style={{ borderColor: "#b42318" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Security relation</h2>
        <p>
          Vercel owner authentication → short-lived signed Railway grant → temporary viewer →
          manual Google/ChatGPT login → persistent Chrome profile → MCP read-only closure.
        </p>
        <p>No Google password is stored in Vercel or Railway environment variables.</p>
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 14px",
  border: "1px solid #111",
  borderRadius: 8,
  background: "#111",
  color: "white",
  cursor: "pointer"
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "white",
  color: "#111"
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#b42318",
  borderColor: "#b42318"
};

const buttonLinkStyle: React.CSSProperties = {
  ...buttonStyle,
  display: "inline-block",
  textDecoration: "none"
};

const passwordPanelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: 16,
  border: "1px solid #ddd",
  borderRadius: 12,
  background: "#fafafa",
  flexWrap: "wrap"
};
