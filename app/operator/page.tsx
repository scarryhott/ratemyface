"use client";

import { useMemo, useState } from "react";

type JsonValue = any;

export default function OperatorPage() {
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("Review the current builder system and identify the highest-value admissible next step.");
  const [capabilities, setCapabilities] = useState<JsonValue>(null);
  const [status, setStatus] = useState<JsonValue>(null);
  const [lastResult, setLastResult] = useState<JsonValue>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pendingApprovals = useMemo(() => {
    return Array.isArray(status?.approvals) ? status.approvals : [];
  }, [status]);

  async function request(path: string, init: RequestInit = {}) {
    if (!secret) throw new Error("Enter RMF_OPERATOR_SIGNAL_SECRET first.");
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${secret}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers, cache: "no-store" });
    const data = await response.json().catch(() => ({ ok: false, error: `HTTP_${response.status}` }));
    if (!response.ok) throw new Error(String(data?.error || `HTTP_${response.status}`));
    return data;
  }

  async function act(fn: () => Promise<JsonValue>) {
    setLoading(true);
    setError("");
    try {
      const result = await fn();
      setLastResult(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    await act(async () => {
      const [caps, current] = await Promise.all([
        request("/api/operator/capabilities"),
        request("/api/operator/status")
      ]);
      setCapabilities(caps);
      setStatus(current);
      return { capabilities: caps, status: current };
    });
  }

  async function enqueueAnalysis() {
    await act(async () => {
      const result = await request("/api/operator/signal", {
        method: "POST",
        body: JSON.stringify({
          source: "owner-console",
          kind: "manual",
          requested_authority: 1,
          payload: { message }
        })
      });
      return result;
    });
  }

  async function enqueueProbe() {
    await act(async () => {
      return request("/api/operator/signal", {
        method: "POST",
        body: JSON.stringify({
          source: "owner-console",
          kind: "control_probe",
          requested_authority: 2,
          payload: {
            goal: "Demonstrate isolated GitHub branch control and independently verify the return."
          }
        })
      });
    });
  }

  async function runNext() {
    await act(async () => {
      const result = await request("/api/operator/run", { method: "POST" });
      const current = await request("/api/operator/status");
      setStatus(current);
      return result;
    });
  }

  async function decideApproval(approvalId: number, decision: "approve" | "reject") {
    await act(async () => {
      const result = await request("/api/operator/approval", {
        method: "POST",
        body: JSON.stringify({ approval_id: approvalId, decision })
      });
      const current = await request("/api/operator/status");
      setStatus(current);
      return result;
    });
  }

  const hardMax = capabilities?.security_envelope?.max_authority ?? status?.harness?.max_authority ?? "?";
  const githubWrite = capabilities?.security_envelope?.github_write_configured ?? status?.harness?.runtime?.github?.write_configured;
  const gateway = capabilities?.security_envelope?.ai_gateway_configured ?? status?.harness?.ai_gateway_configured;

  return (
    <main>
      <h1>Builder Operator</h1>
      <p>
        Private control console for the closure-native agent that builds and operates GPT products. The secret stays only in this browser tab state and is sent as an Authorization header; it is not stored by this page.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Authenticate</h2>
        <label htmlFor="operator-secret">RMF_OPERATOR_SIGNAL_SECRET</label>
        <input
          id="operator-secret"
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder="Enter operator signal secret"
          style={{ width: "100%", marginTop: 8, padding: 12, border: "1px solid #bbb", borderRadius: 8 }}
        />
        <button onClick={refresh} disabled={loading || !secret} style={buttonStyle}>
          Inspect agent
        </button>
      </div>

      {(capabilities || status) && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Harness state</h2>
          <p><strong>Harness:</strong> closure-native-v1</p>
          <p><strong>Hard authority ceiling:</strong> L{String(hardMax)}</p>
          <p><strong>AI Gateway:</strong> {gateway ? "configured" : "not configured"}</p>
          <p><strong>GitHub L2 write:</strong> {githubWrite ? "configured" : "not configured"}</p>
          <p><strong>Pending approvals:</strong> {pendingApprovals.length}</p>
          <button onClick={refresh} disabled={loading} style={buttonStyle}>Refresh</button>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Signal the operator</h2>
        <label htmlFor="operator-message">L1 analysis signal</label>
        <textarea
          id="operator-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={5}
          style={{ width: "100%", marginTop: 8, padding: 12, border: "1px solid #bbb", borderRadius: 8, resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={enqueueAnalysis} disabled={loading || !secret} style={buttonStyle}>Queue L1 analysis</button>
          <button onClick={runNext} disabled={loading || !secret} style={buttonStyle}>Run next signal</button>
        </div>
        <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid #ddd" }} />
        <p>
          <strong>L2 control probe:</strong> asks the harness to create one isolated <code>agent/run-*</code> branch, write one diagnostic artifact, read it back, verify it, and halt without merging.
        </p>
        <button onClick={enqueueProbe} disabled={loading || !secret} style={buttonStyle}>Queue L2 control probe</button>
      </div>

      {pendingApprovals.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Pending approvals</h2>
          {pendingApprovals.map((approval: any) => (
            <div key={approval.id} style={{ borderTop: "1px solid #ddd", padding: "16px 0" }}>
              <p><strong>#{approval.id}</strong> {approval.capability} — L{approval.requested_authority}</p>
              <p>{approval.rationale}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => decideApproval(Number(approval.id), "approve")} disabled={loading} style={buttonStyle}>Approve + requeue</button>
                <button onClick={() => decideApproval(Number(approval.id), "reject")} disabled={loading} style={secondaryButtonStyle}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: "#b42318" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {lastResult && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Latest return</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13 }}>
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        </div>
      )}

      {status && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Ledger snapshot</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13 }}>
            {JSON.stringify({
              runs: status.runs?.slice?.(0, 5),
              receipts: status.receipts?.slice?.(0, 5),
              ledger: status.ledger?.slice?.(0, 10)
            }, null, 2)}
          </pre>
        </div>
      )}
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
