"use client";

import { useEffect, useMemo, useState } from "react";

type Owner = { id: string; method: string; email?: string; phone?: string; wallet?: string };
type GPT = {
  id: number;
  gpt_key: string;
  name: string;
  status: string;
  platform: string;
  config?: Record<string, unknown>;
  updated_at: string;
};
type OpsOverview = {
  ok: boolean;
  database_configured?: boolean;
  generated_at?: string;
  actor?: string;
  owner?: Owner | null;
  counts?: { projects: number; runs: number; signals: number; ledger: number; gpts: number; receipts: number; approvals_pending: number; approvals_total: number };
  accounts?: { auth_users: number; oauth_users: number; active_oauth_tokens: number };
  portfolio?: { active_gpts: number; draft_gpts: number; public_gpts: number; action_gpts: number; amazon_linked_gpts: number };
  commerce?: { amazon: Record<string, unknown> | null };
  projects?: Array<{ id: number; slug: string; name: string; repository: string | null; status: string; updated_at: string }>;
  recent_runs?: Array<{ id: number; model: string | null; authority: number; status: string; closure_state: string | null; error: string | null; created_at: string }>;
  recent_signals?: Array<{ id: number; source: string; kind: string; status: string; requested_authority: number; created_at: string }>;
  recent_ledger?: Array<{ id: number; event: string; capability: string | null; authority: number; admissible: boolean; created_at: string }>;
  gpts?: GPT[];
  recent_receipts?: Array<{ id: number; run_id: number; tool: string; verified: boolean; created_at: string }>;
  recent_approvals?: Array<{ id: number; capability: string; requested_authority: number; status: string; created_at: string }>;
  external_metrics?: Record<string, { status: string; note: string }>;
  error?: string;
};

function when(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function money(value: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}
function num(value: unknown) {
  return Number(value || 0).toLocaleString();
}
function text(value: unknown, fallback = "—") {
  return value == null || value === "" ? fallback : String(value);
}

export default function OperatorBusinessDashboard() {
  const [secret, setSecret] = useState("");
  const [owner, setOwner] = useState<Owner | null>(null);
  const [data, setData] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadOwner() {
    const response = await fetch("/api/operator/owner", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) { setOwner(null); return null; }
    const body = await response.json();
    setOwner(body.owner);
    return body.owner as Owner;
  }

  async function loadOps(currentSecret = secret) {
    setLoading(true); setError("");
    try {
      const headers = new Headers();
      if (currentSecret) headers.set("Authorization", `Bearer ${currentSecret}`);
      const response = await fetch("/api/operator/ops", { headers, cache: "no-store", credentials: "same-origin" });
      const body = (await response.json().catch(() => ({ ok: false, error: `HTTP_${response.status}` }))) as OpsOverview;
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      setData(body);
      if (body.owner) setOwner(body.owner);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  }

  useEffect(() => { void (async () => { const current = await loadOwner(); if (current) await loadOps(""); })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await fetch("/api/operator/owner/session", { method: "DELETE", credentials: "same-origin" });
    setOwner(null); setData(null);
  }

  const amazon = data?.commerce?.amazon || null;
  const portfolio = data?.portfolio;
  const accounts = data?.accounts;
  const gpts = data?.gpts || [];
  const publicGpts = useMemo(() => gpts.filter((g) => g.config?.visibility === "public"), [gpts]);
  const businessHealth = error ? "Needs attention" : data?.database_configured ? "Operational" : "Waiting for data";

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <p style={{ marginBottom: 8 }}><a href="/operator">← Operator console</a></p>
          <h1 style={{ margin: 0, fontSize: 36 }}>Rate My Face Business</h1>
          <p className="muted" style={{ maxWidth: 760 }}>Owner-only control center for GPT portfolio, accounts, commerce, agent operations, and infrastructure-backed business state.</p>
        </div>
        <div style={{ ...pill, background: data?.database_configured ? "#ecfdf3" : "#fff7ed", color: data?.database_configured ? "#067647" : "#b54708" }}>{businessHealth}</div>
      </div>

      <section className="card" style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          {owner ? <><strong>{owner.email || owner.phone || owner.wallet || owner.id}</strong><div className="muted">Owner session · {owner.method}</div></> : <div>Owner sign-in required for live business data.</div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {owner ? <>
            <button style={button} onClick={() => loadOps()} disabled={loading}>{loading ? "Refreshing…" : "Refresh data"}</button>
            <button style={secondaryButton} onClick={signOut}>Sign out</button>
          </> : <a style={linkButton} href="/operator/login?next=/operator/dashboard">Sign in with Google</a>}
        </div>
        {!owner && <div style={{ width: "100%", display: "flex", gap: 8 }}><input type="password" placeholder="Machine/operator secret" value={secret} onChange={(e) => setSecret(e.target.value)} style={input}/><button style={button} disabled={!secret || loading} onClick={() => loadOps()}>Load</button></div>}
      </section>

      {error && <section className="card" style={{ borderColor: "#f04438" }}><strong>Dashboard error:</strong> {error}</section>}

      {data && <>
        <h2 style={sectionTitle}>Business snapshot</h2>
        <section style={grid4}>
          <Metric label="GPT portfolio" value={data.counts?.gpts} note={`${portfolio?.active_gpts || 0} active · ${portfolio?.public_gpts || 0} public`} />
          <Metric label="Accounts" value={accounts?.auth_users} note={`${accounts?.oauth_users || 0} GPT OAuth linked`} />
          <Metric label="Amazon clicks · 30d" value={amazon?.clicks} note={`${num(amazon?.ordered_items)} orders · ${text(amazon?.conversion_rate, "0")}% conversion`} />
          <Metric label="Affiliate earnings · 30d" value={money(amazon?.earnings_usd)} note={`${money(amazon?.ordered_revenue_usd)} ordered revenue`} raw />
        </section>

        <section style={{ ...grid2, marginTop: 16 }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Acquisition & monetization</h2>
            <div style={funnelRow}><span>Public GPTs</span><strong>{portfolio?.public_gpts || 0}</strong></div>
            <div style={funnelRow}><span>Amazon-linked GPTs</span><strong>{portfolio?.amazon_linked_gpts || 0}</strong></div>
            <div style={funnelRow}><span>30-day affiliate clicks</span><strong>{num(amazon?.clicks)}</strong></div>
            <div style={funnelRow}><span>Ordered items</span><strong>{num(amazon?.ordered_items)}</strong></div>
            <div style={funnelRow}><span>Affiliate earnings</span><strong>{money(amazon?.earnings_usd)}</strong></div>
            <p className="muted" style={{ marginBottom: 0 }}>Amazon snapshot: {amazon ? `${text(amazon.period_start)} → ${text(amazon.period_end)}` : "not stored yet"}. Current product-link fallback remains the supported path.</p>
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Accounts & retention foundation</h2>
            <div style={funnelRow}><span>Supabase auth users</span><strong>{accounts?.auth_users || 0}</strong></div>
            <div style={funnelRow}><span>GPT OAuth users</span><strong>{accounts?.oauth_users || 0}</strong></div>
            <div style={funnelRow}><span>Active OAuth tokens</span><strong>{accounts?.active_oauth_tokens || 0}</strong></div>
            <div style={funnelRow}><span>GPTs with Actions</span><strong>{portfolio?.action_gpts || 0}</strong></div>
            <p className="muted" style={{ marginBottom: 0 }}>Next product layer: consented Personal Network → Compare Me to Me → paid persistent analysis.</p>
          </div>
        </section>

        <h2 style={sectionTitle}>GPT portfolio</h2>
        <section className="card">
          <div style={grid4}>
            <Mini label="Active" value={portfolio?.active_gpts || 0}/><Mini label="Drafts" value={portfolio?.draft_gpts || 0}/><Mini label="Public" value={portfolio?.public_gpts || 0}/><Mini label="Amazon-linked" value={portfolio?.amazon_linked_gpts || 0}/>
          </div>
          <div className="tableWrap" style={{ marginTop: 18 }}><table className="opsTable"><thead><tr><th>GPT</th><th>Status</th><th>Visibility</th><th>Actions</th><th>Amazon</th><th>Reported usage</th><th>Tracking ID</th></tr></thead><tbody>{gpts.map((g) => <tr key={g.id}><td><strong>{g.name}</strong><div className="muted"><code>{g.gpt_key}</code></div></td><td>{g.status}</td><td>{text(g.config?.visibility)}</td><td>{g.config?.actions ? "yes" : "no"}</td><td>{g.config?.amazon_links ? "yes" : "no"}</td><td>{text(g.config?.chat_count_reported)}</td><td><code>{text(g.config?.amazon_tracking_id)}</code></td></tr>)}</tbody></table></div>
          {!!publicGpts.length && <p className="muted" style={{ marginBottom: 0 }}>Public portfolio: {publicGpts.map((g) => g.name).join(" · ")}</p>}
        </section>

        <h2 style={sectionTitle}>Operations</h2>
        <section style={grid4}>
          <Metric label="Agent runs" value={data.counts?.runs} note="Recorded runs" />
          <Metric label="Signals" value={data.counts?.signals} note="Monitor / operator signals" />
          <Metric label="Ledger events" value={data.counts?.ledger} note="Admissible action trail" />
          <Metric label="Pending approvals" value={data.counts?.approvals_pending} note={`${data.counts?.receipts || 0} receipts`} />
        </section>

        <section style={{ ...grid2, marginTop: 16 }}>
          <div className="card"><h2 style={{ marginTop: 0 }}>Recent agent runs</h2>{!data.recent_runs?.length ? <p className="muted">No runs recorded.</p> : data.recent_runs.map((r) => <div key={r.id} style={activity}><div><strong>Run #{r.id}</strong> · {r.status}<div className="muted">{r.model || "model n/a"} · L{r.authority} · {r.closure_state || "closure n/a"}</div></div><small>{when(r.created_at)}</small></div>)}</div>
          <div className="card"><h2 style={{ marginTop: 0 }}>Recent ledger</h2>{!data.recent_ledger?.length ? <p className="muted">No ledger entries.</p> : data.recent_ledger.slice(0, 8).map((r) => <div key={r.id} style={activity}><div><strong>{r.event}</strong><div className="muted">{r.capability || "general"} · L{r.authority} · {r.admissible ? "admissible" : "blocked"}</div></div><small>{when(r.created_at)}</small></div>)}</div>
        </section>

        <h2 style={sectionTitle}>System state</h2>
        <section style={grid4}>
          <Status label="Database" state={data.database_configured ? "Connected" : "Not configured"} ok={Boolean(data.database_configured)} />
          <Status label="Owner auth" state={owner ? "Google session active" : "Not signed in"} ok={Boolean(owner)} />
          <Status label="Amazon" state={amazon ? "Snapshot stored" : "No snapshot"} ok={Boolean(amazon)} />
          <Status label="Approvals" state={data.counts?.approvals_pending ? `${data.counts.approvals_pending} pending` : "Clear"} ok={!data.counts?.approvals_pending} />
        </section>

        <section className="card" style={{ marginTop: 16 }}><h2 style={{ marginTop: 0 }}>Projects & infrastructure references</h2>{data.projects?.map((p) => <div key={p.id} style={activity}><div><strong>{p.name}</strong><div className="muted">{p.repository || "No repository"} · {p.slug}</div></div><span style={pill}>{p.status}</span></div>)}<div style={{ marginTop: 14 }}>{Object.entries(data.external_metrics || {}).map(([key, value]) => <div key={key} className="muted" style={{ marginTop: 6 }}><strong>{key.replaceAll("_", " ")}:</strong> {value.status} — {value.note}</div>)}</div></section>

        <p className="muted">Generated {when(data.generated_at)}{data.actor ? ` · actor ${data.actor}` : ""}</p>
      </>}
    </main>
  );
}

function Metric({ label, value, note, raw = false }: { label: string; value: unknown; note: string; raw?: boolean }) {
  return <div className="card" style={{ minHeight: 122 }}><div className="muted" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div><div style={{ fontSize: 34, fontWeight: 750, margin: "8px 0" }}>{raw ? String(value ?? "—") : num(value)}</div><div className="muted">{note}</div></div>;
}
function Mini({ label, value }: { label: string; value: unknown }) { return <div><div className="muted">{label}</div><strong style={{ fontSize: 24 }}>{num(value)}</strong></div>; }
function Status({ label, state, ok }: { label: string; state: string; ok: boolean }) { return <div className="card"><div className="muted">{label}</div><div style={{ fontWeight: 700, marginTop: 8 }}>{state}</div><div style={{ ...pill, marginTop: 10, display: "inline-block", background: ok ? "#ecfdf3" : "#fff7ed", color: ok ? "#067647" : "#b54708" }}>{ok ? "OK" : "Check"}</div></div>; }

const sectionTitle: React.CSSProperties = { marginTop: 30, marginBottom: 12, fontSize: 22 };
const grid4: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 };
const funnelRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 20, padding: "10px 0", borderBottom: "1px solid #eee" };
const activity: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, padding: "11px 0", borderBottom: "1px solid #eee", alignItems: "flex-start" };
const pill: React.CSSProperties = { borderRadius: 999, padding: "6px 10px", fontSize: 13, fontWeight: 650, background: "#f2f4f7" };
const button: React.CSSProperties = { padding: "10px 14px", border: "1px solid #111", borderRadius: 8, background: "#111", color: "#fff", cursor: "pointer" };
const secondaryButton: React.CSSProperties = { ...button, background: "white", color: "#111" };
const linkButton: React.CSSProperties = { ...button, textDecoration: "none", display: "inline-block" };
const input: React.CSSProperties = { flex: 1, minWidth: 220, padding: "10px 12px", border: "1px solid #bbb", borderRadius: 8 };
