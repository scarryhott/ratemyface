"use client";

import { useEffect, useState } from "react";

type OpsOverview = {
  ok: boolean;
  database_configured?: boolean;
  generated_at?: string;
  actor?: string;
  owner?: { id: string; method: string; email?: string; phone?: string; wallet?: string } | null;
  counts?: {
    projects: number;
    runs: number;
    signals: number;
    ledger: number;
    gpts: number;
    receipts: number;
    approvals_pending: number;
    approvals_total: number;
  };
  projects?: Array<{
    id: number;
    slug: string;
    name: string;
    repository: string | null;
    vercel_project_id: string | null;
    status: string;
    updated_at: string;
  }>;
  recent_runs?: Array<{
    id: number;
    signal_id: number | null;
    model: string | null;
    authority: number;
    status: string;
    harness: string | null;
    closure_state: string | null;
    error: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
  recent_signals?: Array<{
    id: number;
    source: string;
    kind: string;
    status: string;
    requested_authority: number;
    created_at: string;
  }>;
  recent_ledger?: Array<{
    id: number;
    run_id: number | null;
    event: string;
    capability: string | null;
    authority: number;
    admissible: boolean;
    created_at: string;
  }>;
  gpts?: Array<{
    id: number;
    gpt_key: string;
    name: string;
    platform: string;
    status: string;
    external_id: string | null;
    updated_at: string;
  }>;
  recent_receipts?: Array<{
    id: number;
    run_id: number;
    tool: string;
    authority: number;
    verified: boolean;
    external_ref: string | null;
    created_at: string;
  }>;
  recent_approvals?: Array<{
    id: number;
    capability: string;
    requested_authority: number;
    status: string;
    rationale: string | null;
    created_at: string;
  }>;
  external_metrics?: {
    amazon_associates: { status: string; note: string };
    vercel_analytics: { status: string; note: string };
    railway_browser: { status: string; note: string };
  };
  error?: string;
};

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function EmptyState({ label }: { label: string }) {
  return <p className="muted">{label}</p>;
}

export default function OperatorOpsDashboardPage() {
  const [secret, setSecret] = useState("");
  const [owner, setOwner] = useState<OpsOverview["owner"]>(null);
  const [data, setData] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadOwner() {
    const response = await fetch("/api/operator/owner", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) {
      setOwner(null);
      return null;
    }
    const body = await response.json();
    setOwner(body.owner);
    return body.owner;
  }

  async function loadOps(currentSecret = secret) {
    setLoading(true);
    setError("");
    try {
      const headers = new Headers();
      if (currentSecret) headers.set("Authorization", `Bearer ${currentSecret}`);
      const response = await fetch("/api/operator/ops", {
        headers,
        cache: "no-store",
        credentials: "same-origin"
      });
      const body = (await response.json().catch(() => ({ ok: false, error: `HTTP_${response.status}` }))) as OpsOverview;
      if (!response.ok) throw new Error(String(body.error || `HTTP_${response.status}`));
      setData(body);
      if (body.owner) setOwner(body.owner);
      return body;
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const currentOwner = await loadOwner();
      if (currentOwner) await loadOps("");
    })();
    // Initial owner-cookie load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await fetch("/api/operator/owner/session", { method: "DELETE", credentials: "same-origin" });
    setOwner(null);
    setData(null);
  }

  const authenticated = Boolean(owner || secret);
  const counts = data?.counts;

  return (
    <main style={{ maxWidth: 1100 }}>
      <p>
        <a href="/operator">← Builder Operator</a>
      </p>
      <h1>Ops overview</h1>
      <p>
        Business health snapshot from Postgres <code>rmf_agent_*</code> tables. OAuth tokens and secrets are never loaded here.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Access</h2>
        {owner ? (
          <>
            <p>
              <strong>Signed in:</strong> {owner.email || owner.phone || owner.wallet || owner.id}
            </p>
            <p>
              <strong>Method:</strong> {owner.method}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => loadOps()} disabled={loading} style={buttonStyle}>
                Refresh
              </button>
              <a href="/operator" style={buttonLinkStyle}>
                Operator console
              </a>
              <button onClick={signOut} disabled={loading} style={secondaryButtonStyle}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Sign in as the allowlisted owner, or use the operator signal secret for machine access.</p>
            <a href="/operator/login?next=/operator/dashboard" style={{ display: "inline-block", marginTop: 8 }}>
              Open owner sign in
            </a>
            <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid #ddd" }} />
            <label htmlFor="ops-secret">Machine/operator secret</label>
            <input
              id="ops-secret"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="RMF_OPERATOR_SIGNAL_SECRET"
              style={{ width: "100%", marginTop: 8, padding: 12, border: "1px solid #bbb", borderRadius: 8 }}
            />
            <button onClick={() => loadOps()} disabled={loading || !secret} style={buttonStyle}>
              Load ops overview
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#b42318" }}>
          <strong>Error:</strong> {error}
          {!authenticated && <p className="muted">Authenticate to load live counts and rows.</p>}
        </div>
      )}

      {data && (
        <>
          <section className="dashboardGrid">
            {[
              ["Projects", counts?.projects],
              ["Runs", counts?.runs],
              ["Signals", counts?.signals],
              ["Ledger", counts?.ledger],
              ["GPTs", counts?.gpts],
              ["Receipts", counts?.receipts],
              ["Approvals pending", counts?.approvals_pending],
              ["Approvals total", counts?.approvals_total]
            ].map(([label, value]) => (
              <div className="card metricCard" key={String(label)}>
                <div className="metricLabel">{label}</div>
                <div className="metricValue">{Number(value || 0).toLocaleString()}</div>
              </div>
            ))}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Projects</h2>
            {!data.projects?.length ? (
              <EmptyState label="No projects yet." />
            ) : (
              <div className="tableWrap">
                <table className="opsTable">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Slug</th>
                      <th>Status</th>
                      <th>Repository</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projects.map((project) => (
                      <tr key={project.id}>
                        <td>{project.name}</td>
                        <td><code>{project.slug}</code></td>
                        <td>{project.status}</td>
                        <td>{project.repository || "—"}</td>
                        <td>{formatWhen(project.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Recent runs</h2>
            {!data.recent_runs?.length ? (
              <EmptyState label="No agent runs recorded yet." />
            ) : (
              <div className="tableWrap">
                <table className="opsTable">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Status</th>
                      <th>Auth</th>
                      <th>Closure</th>
                      <th>Model</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_runs.map((run) => (
                      <tr key={run.id}>
                        <td>#{run.id}</td>
                        <td>{run.status}</td>
                        <td>L{run.authority}</td>
                        <td>{run.closure_state || "—"}</td>
                        <td>{run.model || "—"}</td>
                        <td>{formatWhen(run.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Signals</h2>
            {!data.recent_signals?.length ? (
              <EmptyState label="No signals queued yet." />
            ) : (
              <div className="tableWrap">
                <table className="opsTable">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Source</th>
                      <th>Kind</th>
                      <th>Status</th>
                      <th>Auth</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_signals.map((signal) => (
                      <tr key={signal.id}>
                        <td>#{signal.id}</td>
                        <td>{signal.source}</td>
                        <td>{signal.kind}</td>
                        <td>{signal.status}</td>
                        <td>L{signal.requested_authority}</td>
                        <td>{formatWhen(signal.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Ledger</h2>
            {!data.recent_ledger?.length ? (
              <EmptyState label="No ledger entries yet." />
            ) : (
              <div className="tableWrap">
                <table className="opsTable">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Event</th>
                      <th>Capability</th>
                      <th>Auth</th>
                      <th>Admissible</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_ledger.map((entry) => (
                      <tr key={entry.id}>
                        <td>#{entry.id}</td>
                        <td>{entry.event}</td>
                        <td>{entry.capability || "—"}</td>
                        <td>L{entry.authority}</td>
                        <td>{entry.admissible ? "yes" : "no"}</td>
                        <td>{formatWhen(entry.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>GPT inventory</h2>
            {!data.gpts?.length ? (
              <EmptyState label="GPT inventory is empty. Rows will appear here once rmf_agent_gpts is populated." />
            ) : (
              <div className="tableWrap">
                <table className="opsTable">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Key</th>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.gpts.map((gpt) => (
                      <tr key={gpt.id}>
                        <td>{gpt.name}</td>
                        <td><code>{gpt.gpt_key}</code></td>
                        <td>{gpt.platform}</td>
                        <td>{gpt.status}</td>
                        <td>{formatWhen(gpt.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Receipts & approvals</h2>
            <div className="statusList">
              <div><strong>Receipts shown:</strong> {data.recent_receipts?.length || 0}</div>
              <div><strong>Approvals shown:</strong> {data.recent_approvals?.length || 0}</div>
              <div><strong>Pending approvals:</strong> {counts?.approvals_pending ?? 0}</div>
            </div>
            {!data.recent_receipts?.length && !data.recent_approvals?.length ? (
              <EmptyState label="No receipts or approvals recorded yet." />
            ) : (
              <>
                {!!data.recent_receipts?.length && (
                  <div className="tableWrap" style={{ marginTop: 16 }}>
                    <table className="opsTable">
                      <thead>
                        <tr>
                          <th>Receipt</th>
                          <th>Run</th>
                          <th>Tool</th>
                          <th>Verified</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent_receipts.map((receipt) => (
                          <tr key={receipt.id}>
                            <td>#{receipt.id}</td>
                            <td>#{receipt.run_id}</td>
                            <td>{receipt.tool}</td>
                            <td>{receipt.verified ? "yes" : "no"}</td>
                            <td>{formatWhen(receipt.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!!data.recent_approvals?.length && (
                  <div className="tableWrap" style={{ marginTop: 16 }}>
                    <table className="opsTable">
                      <thead>
                        <tr>
                          <th>Approval</th>
                          <th>Capability</th>
                          <th>Auth</th>
                          <th>Status</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent_approvals.map((approval) => (
                          <tr key={approval.id}>
                            <td>#{approval.id}</td>
                            <td>{approval.capability}</td>
                            <td>L{approval.requested_authority}</td>
                            <td>{approval.status}</td>
                            <td>{formatWhen(approval.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>External metrics</h2>
            <p className="muted">Placeholders only — these sources are not ingested into Postgres yet. Numbers are not invented.</p>
            <div className="statusList">
              <div>
                <strong>Amazon Associates:</strong> {data.external_metrics?.amazon_associates.status} — {data.external_metrics?.amazon_associates.note}
              </div>
              <div>
                <strong>Vercel analytics:</strong> {data.external_metrics?.vercel_analytics.status} — {data.external_metrics?.vercel_analytics.note}
              </div>
              <div>
                <strong>Railway browser:</strong> {data.external_metrics?.railway_browser.status} — {data.external_metrics?.railway_browser.note}
              </div>
            </div>
          </section>

          <p className="muted">
            Generated {formatWhen(data.generated_at)}
            {data.database_configured === false ? " · database not configured in this environment" : ""}
            {data.actor ? ` · actor ${data.actor}` : ""}
          </p>
        </>
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
const secondaryButtonStyle: React.CSSProperties = { ...buttonStyle, background: "white", color: "#111" };
const buttonLinkStyle: React.CSSProperties = { ...buttonStyle, display: "inline-block", textDecoration: "none" };
