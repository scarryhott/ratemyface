"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionHeading, FunnelRow } from "./MetricCard";
import {
  button,
  secondaryButton,
  dangerButton,
  grid2,
  activity,
  when,
  num,
  text
} from "./styles";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta?: string;
  at: string;
};

type AgentsPayload = {
  ok: boolean;
  error?: string;
  queue?: { signals_queued: number; pending_approvals: number; runs_7d: number };
  strategy?: {
    latest: any | null;
    history: any[];
  };
  recent_signals?: any[];
  recent_runs?: any[];
  pending_approvals?: any[];
  harness?: any;
  metrics?: any;
  commercial_loop?: string;
};

export function AgentConsoleSection({
  canOperate,
  authHeaders,
  onBusinessRefresh
}: {
  canOperate: boolean;
  authHeaders: () => Headers;
  onBusinessRefresh: () => Promise<void>;
}) {
  const [agents, setAgents] = useState<AgentsPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    "What is the highest-value bottleneck in the Rate My Face commercial loop right now, and what reversible next step should we take?"
  );
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content:
        "Agent Console — chat with the operator agent, queue improve cycles, approve work, and read strategy impact reports. Missing business metrics stay Unavailable.",
      at: new Date().toISOString()
    }
  ]);

  const refreshAgents = useCallback(async () => {
    if (!canOperate) return;
    setError("");
    try {
      const response = await fetch("/api/operator/agents", {
        headers: authHeaders(),
        cache: "no-store",
        credentials: "same-origin"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      setAgents(body as AgentsPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [canOperate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  async function act<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    const textMsg = message.trim();
    if (!textMsg) return;
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: textMsg,
      at: new Date().toISOString()
    };
    setChat((prev) => [...prev, userMsg]);
    setMessage("");
    await act(async () => {
      const response = await fetch("/api/operator/chat", {
        method: "POST",
        headers: authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ message: textMsg, run_now: true, requested_authority: 1 })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      const impact = body.chat?.business_impact;
      const impactLine = impact
        ? `\n\nStrategy → bottleneck: ${impact.bottleneck || "—"} · next: ${impact.recommended_next_step || "—"} · effect: ${impact.expected_metric_effect || "—"}`
        : "";
      setChat((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: `${body.chat?.content || "No reply."}${impactLine}`,
          meta: `status=${body.chat?.status || "?"} · run #${body.chat?.run_id || "—"}`,
          at: new Date().toISOString()
        }
      ]);
      await refreshAgents();
      await onBusinessRefresh();
      return body;
    });
  }

  async function runImproveCycle() {
    await act(async () => {
      const response = await fetch("/api/operator/chat", {
        method: "PUT",
        headers: authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ run_now: true })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      const report = body.strategy_report || body.run?.strategy_report;
      setChat((prev) => [
        ...prev,
        {
          id: `improve_${Date.now()}`,
          role: "assistant",
          content: report
            ? `Autonomous improve cycle complete.\n${report.summary || ""}\nBottleneck: ${report.bottleneck}\nNext: ${report.recommended_next_step}\nExpected effect: ${report.expected_metric_effect}`
            : body.run?.plan?.summary || "Improve cycle finished (no strategy report).",
          meta: `business_improve · status=${body.run?.status || "?"}`,
          at: new Date().toISOString()
        }
      ]);
      await refreshAgents();
      await onBusinessRefresh();
      return body;
    });
  }

  async function runNext() {
    await act(async () => {
      const response = await fetch("/api/operator/run", {
        method: "POST",
        headers: authHeaders(),
        credentials: "same-origin"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      setChat((prev) => [
        ...prev,
        {
          id: `run_${Date.now()}`,
          role: "system",
          content: body.idle
            ? "Queue idle — no signal to run."
            : `Ran signal → status ${body.status}. ${body.plan?.summary || ""}`.trim(),
          meta: body.run_id ? `run #${body.run_id}` : undefined,
          at: new Date().toISOString()
        }
      ]);
      await refreshAgents();
      return body;
    });
  }

  async function decideApproval(approvalId: number, decision: "approve" | "reject") {
    await act(async () => {
      const response = await fetch("/api/operator/approval", {
        method: "POST",
        headers: authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ approval_id: approvalId, decision })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      await refreshAgents();
      return body;
    });
  }

  const latest = agents?.strategy?.latest;
  const history = agents?.strategy?.history || [];

  return (
    <>
      <SectionHeading
        id="agents"
        title="Chat & manage agents"
        subtitle="Send messages, run improve cycles, approve work, and read how strategy helps the business. Your Grok bot can keep doing hourly ChatGPT checks — this console is the operator control surface."
      />

      <section style={grid2}>
        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 420 }}>
          <h3 style={{ marginTop: 0 }}>Chat</h3>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              maxHeight: 320,
              border: "1px solid #eee",
              borderRadius: 8,
              padding: 12,
              background: "#fcfcfd",
              marginBottom: 12
            }}
          >
            {chat.map((m) => (
              <div key={m.id} style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  {m.role} · {when(m.at)}
                  {m.meta ? ` · ${m.meta}` : ""}
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{m.content}</div>
              </div>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            disabled={!canOperate || busy}
            style={{
              width: "100%",
              padding: 12,
              border: "1px solid #bbb",
              borderRadius: 8,
              resize: "vertical",
              marginBottom: 8
            }}
            placeholder="Ask the agent about bottlenecks, credits, Account Learning, or next experiments…"
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={button} disabled={!canOperate || busy || !message.trim()} onClick={() => void sendChat()}>
              {busy ? "Working…" : "Send + run"}
            </button>
            <button style={secondaryButton} disabled={!canOperate || busy} onClick={() => void runImproveCycle()}>
              Run improve cycle
            </button>
            <button style={secondaryButton} disabled={!canOperate || busy} onClick={() => void runNext()}>
              Run next signal
            </button>
            <button style={secondaryButton} disabled={!canOperate || busy} onClick={() => void refreshAgents()}>
              Refresh agents
            </button>
          </div>
          {error && (
            <p style={{ color: "#b42318", marginBottom: 0, marginTop: 10 }}>
              <strong>Error:</strong> {error}
            </p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Manage</h3>
          <FunnelRow label="Queued signals" value={num(agents?.queue?.signals_queued)} />
          <FunnelRow label="Pending approvals" value={num(agents?.queue?.pending_approvals)} />
          <FunnelRow label="Runs · 7d" value={num(agents?.queue?.runs_7d)} />
          <FunnelRow
            label="Harness"
            value={`${agents?.harness?.version || "closure-native-v1"} · L${agents?.harness?.max_authority ?? "?"}`}
          />
          <FunnelRow
            label="AI Gateway"
            value={agents?.harness?.ai_gateway_configured ? "configured" : "not configured"}
          />
          <p className="muted" style={{ marginTop: 12 }}>
            {agents?.commercial_loop ||
              "free GPT → Action → account → persistence → credits → retention → experiment → profit"}
          </p>

          {!!agents?.pending_approvals?.length && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ marginBottom: 8 }}>Pending approvals</h4>
              {agents.pending_approvals.map((a: any) => (
                <div key={a.id} style={{ ...activity, flexDirection: "column", alignItems: "stretch" }}>
                  <div>
                    <strong>
                      #{a.id} · {a.capability}
                    </strong>{" "}
                    · L{a.requested_authority}
                    <div className="muted">{text(a.rationale)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      style={button}
                      disabled={busy}
                      onClick={() => void decideApproval(Number(a.id), "approve")}
                    >
                      Approve + requeue
                    </button>
                    <button
                      style={dangerButton}
                      disabled={busy}
                      onClick={() => void decideApproval(Number(a.id), "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <h4 style={{ marginBottom: 8 }}>Recent runs</h4>
            {!agents?.recent_runs?.length ? (
              <p className="muted">No agent runs yet.</p>
            ) : (
              agents.recent_runs.slice(0, 6).map((r: any) => (
                <div key={r.id} style={activity}>
                  <div>
                    <strong>Run #{r.id}</strong> · {r.status}
                    <div className="muted">
                      {r.model || "model n/a"} · {text(r.plan_summary).slice(0, 120)}
                    </div>
                  </div>
                  <small>{when(r.created_at)}</small>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Strategy impact — how improve cycles help the business</h3>
        {!latest ? (
          <p className="muted">
            No strategy reports yet. Run an improve cycle or chat with the agent — reports from{" "}
            <code>business_improve</code> / <code>owner_chat</code> / cron heartbeat land here.
          </p>
        ) : (
          <>
            <FunnelRow label="Latest bottleneck" value={text(latest.bottleneck)} />
            <FunnelRow label="Funnel stage" value={text(latest.funnel_stage)} />
            <FunnelRow label="Confidence" value={text(latest.confidence)} />
            <FunnelRow label="Hypothesis" value={text(latest.hypothesis)} />
            <FunnelRow label="Recommended next step" value={text(latest.recommended_next_step)} />
            <FunnelRow label="Expected metric effect" value={text(latest.expected_metric_effect)} />
            <FunnelRow label="Run / status" value={`#${latest.run_id || "—"} · ${text(latest.status)}`} />
            <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{text(latest.summary)}</p>
            {latest.metrics_before && (
              <p className="muted" style={{ marginBottom: 0 }}>
                Snapshot at report: users={text(latest.metrics_before.auth_users)} · oauth=
                {text(latest.metrics_before.oauth_users)} · profiles=
                {text(latest.metrics_before.personal_profiles)} · credits remaining=
                {text(latest.metrics_before.credit_balance_total)} · purchased=
                {text(latest.metrics_before.lifetime_purchased)} · spent=
                {text(latest.metrics_before.lifetime_spent)} · stripe events=
                {text(latest.metrics_before.stripe_events)}
              </p>
            )}
          </>
        )}

        {!!history.length && (
          <div style={{ marginTop: 18 }}>
            <h4 style={{ marginBottom: 8 }}>Recent strategy reports</h4>
            <div className="tableWrap">
              <table className="opsTable">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th>Bottleneck</th>
                    <th>Next step</th>
                    <th>Stage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 10).map((r: any) => (
                    <tr key={r.id}>
                      <td>{when(r.created_at)}</td>
                      <td>{text(r.kind)}</td>
                      <td>{text(r.bottleneck)}</td>
                      <td>{text(r.recommended_next_step).slice(0, 80)}</td>
                      <td>{text(r.funnel_stage)}</td>
                      <td>{text(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
