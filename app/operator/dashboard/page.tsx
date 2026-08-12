"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

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
type BillingOverview = {
  credit_model?: {
    credits_per_pack: number;
    metered_personal_cost: number;
    metered_memory_cost: number;
    report_cost: number;
    signup_credits?: number;
    label?: string;
  };
  stripe?: {
    secret_configured: boolean;
    credit_price_configured: boolean;
    subscription_price_configured: boolean;
    webhook_configured: boolean;
  };
  accounts_with_balance?: number;
  total_credit_balance?: number;
  lifetime_purchased?: number;
  lifetime_spent?: number;
  premium_entitlements_active?: number;
  billing_accounts?: number;
  personal_profiles?: number;
  memory_contexts?: number;
  usage_by_action_30d?: Array<{ action: string; events: number; credits_spent: number }>;
  recent_credit_ledger?: Array<{
    id: number;
    user_id: string;
    delta: number;
    balance_after: number;
    reason: string;
    action: string | null;
    created_at: string;
  }>;
  revenue_mapping?: string;
};
type CreditAccount = {
  user_id: string;
  balance: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  updated_at?: string | null;
  label?: string;
  recent_ledger?: Array<{
    id: number;
    delta: number;
    balance_after: number;
    reason: string;
    action: string | null;
    external_ref?: string | null;
    created_at: string;
  }>;
};
type InfrastructureBoundary = {
  vercel_hosting?: { plan: string; status: string; payment_methods: string; note: string };
  vercel_ai_gateway?: { balance_usd: number; auto_reload: boolean; note: string };
  product_credits?: {
    system: string;
    label: string;
    credits_per_pack: number;
    metered_memory_cost: number;
    metered_personal_cost: number;
    report_cost: number;
    checkout_action: string;
    entitlements: string;
    note: string;
  };
  nodejs_runtime_note?: string;
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
  billing?: BillingOverview;
  infrastructure?: InfrastructureBoundary;
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
  const [creditUserId, setCreditUserId] = useState("");
  const [creditAmount, setCreditAmount] = useState("100");
  const [creditNote, setCreditNote] = useState("");
  const [creditLookup, setCreditLookup] = useState<CreditAccount | null>(null);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditMessage, setCreditMessage] = useState("");

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

  function authHeaders() {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (secret) headers.set("Authorization", `Bearer ${secret}`);
    return headers;
  }

  async function lookupCredits() {
    const userId = creditUserId.trim();
    if (!userId) { setCreditMessage("Enter a user_id (OAuth subject)."); return; }
    setCreditBusy(true); setCreditMessage("");
    try {
      const response = await fetch(`/api/operator/credits?user_id=${encodeURIComponent(userId)}`, {
        headers: authHeaders(),
        cache: "no-store",
        credentials: "same-origin"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      setCreditLookup(body.account as CreditAccount);
      setCreditMessage(`Balance ${body.account?.balance ?? 0} · ${body.product_credits_label || "Stripe RMF product credits"}`);
    } catch (err) {
      setCreditLookup(null);
      setCreditMessage(err instanceof Error ? err.message : String(err));
    } finally { setCreditBusy(false); }
  }

  async function grantCreditsToUser() {
    const userId = creditUserId.trim();
    const amount = Number.parseInt(creditAmount, 10);
    if (!userId) { setCreditMessage("Enter a user_id (OAuth subject)."); return; }
    if (!Number.isInteger(amount) || amount <= 0) { setCreditMessage("Amount must be a positive integer."); return; }
    setCreditBusy(true); setCreditMessage("");
    try {
      const response = await fetch("/api/operator/credits", {
        method: "POST",
        headers: authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ user_id: userId, amount, note: creditNote.trim() || undefined })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      setCreditLookup(body.account as CreditAccount);
      setCreditMessage(`Granted ${amount} via grantCredits. Balance ${body.account?.balance ?? body.balance ?? 0} (Stripe RMF product ledger — not Vercel).`);
      await loadOps();
    } catch (err) {
      setCreditMessage(err instanceof Error ? err.message : String(err));
    } finally { setCreditBusy(false); }
  }

  useEffect(() => { void (async () => { const current = await loadOwner(); if (current) await loadOps(""); })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await fetch("/api/operator/owner/session", { method: "DELETE", credentials: "same-origin" });
    setOwner(null); setData(null);
  }

  const amazon = data?.commerce?.amazon || null;
  const portfolio = data?.portfolio;
  const accounts = data?.accounts;
  const billing = data?.billing;
  const infrastructure = data?.infrastructure;
  const stripe = billing?.stripe;
  const creditModel = billing?.credit_model;
  const gpts = data?.gpts || [];
  const publicGpts = useMemo(() => gpts.filter((g) => g.config?.visibility === "public"), [gpts]);
  const businessHealth = error ? "Needs attention" : data?.database_configured ? "Operational" : "Waiting for data";
  const premiumConfigured = Boolean(stripe?.subscription_price_configured);
  const oauthUsers = accounts?.oauth_users || 0;
  const premiumActive = billing?.premium_entitlements_active || 0;
  const freePlanUsers = Math.max(oauthUsers - premiumActive, 0);
  const productCreditLabel = creditModel?.label || infrastructure?.product_credits?.label || "Rate My Face product credits (Stripe ledger)";

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <p style={{ marginBottom: 8 }}><a href="/operator">← Operator console</a></p>
          <h1 style={{ margin: 0, fontSize: 36 }}>Rate My Face Business</h1>
          <p className="muted" style={{ maxWidth: 760 }}>
            Owner-only control center for GPT portfolio, accounts, commerce, Stripe-metered product credits, and agent operations.
            Vercel Hobby / AI Gateway balances are hosting infrastructure — not product credits.
          </p>
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
          <Metric label="RMF product credits · total" value={billing?.total_credit_balance} note={`${num(billing?.accounts_with_balance)} Stripe ledger accounts with balance`} />
          <Metric label="RMF credits spent · lifetime" value={billing?.lifetime_spent} note={`${num(billing?.lifetime_purchased)} purchased via Stripe packs`} />
        </section>

        <h2 style={sectionTitle}>Product credits (Stripe) — not Vercel</h2>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12, maxWidth: 900 }}>
          {productCreditLabel}. Managed here and by GPT Actions (<code>getEntitlements</code> / <code>createCreditCheckoutSession</code>).
          Do not confuse with Vercel Hobby quotas or Vercel AI Gateway USD.
        </p>
        <section style={{ ...grid4 }}>
          <Metric label="Pack size" value={creditModel?.credits_per_pack ?? 100} note="createCreditCheckoutSession" />
          <Metric label="Metered Action cost" value={creditModel?.metered_personal_cost ?? 1} note={`memory ${creditModel?.metered_memory_cost ?? 1} · report ${creditModel?.report_cost ?? 5}`} />
          <Metric label="Optional signup grant" value={creditModel?.signup_credits ?? 100} note={(creditModel?.signup_credits ?? 100) > 0 ? "RMF_SIGNUP_CREDITS → grantCredits once" : "Disabled (RMF_SIGNUP_CREDITS=0)"} />
          <Metric label="Stored profiles" value={billing?.personal_profiles} note={`${num(billing?.memory_contexts)} legacy memory contexts`} />
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Founder grant — product credits (Stripe ledger)</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Preferred test path: look up an OAuth <code>user_id</code>, then grant into the same <code>grantCredits</code> / <code>rmf_credit_ledger</code> used by checkout webhooks and Action metering.
            Not Vercel Hobby / AI Gateway. Optional first-OAuth signup grant is {creditModel?.signup_credits ?? 100} when enabled (<code>RMF_SIGNUP_CREDITS</code>; set <code>0</code> to disable).
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input
              style={{ ...input, minWidth: 280 }}
              placeholder="OAuth user_id"
              value={creditUserId}
              onChange={(e) => setCreditUserId(e.target.value)}
            />
            <input
              style={{ ...input, minWidth: 120, flex: "0 0 120px" }}
              placeholder="Amount"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
            <input
              style={input}
              placeholder="Note (optional)"
              value={creditNote}
              onChange={(e) => setCreditNote(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={secondaryButton} disabled={creditBusy || (!owner && !secret)} onClick={() => void lookupCredits()}>
              {creditBusy ? "Working…" : "Show balance"}
            </button>
            <button style={button} disabled={creditBusy || (!owner && !secret)} onClick={() => void grantCreditsToUser()}>
              Grant credits
            </button>
          </div>
          {creditMessage && <p style={{ marginBottom: 0, marginTop: 12 }}>{creditMessage}</p>}
          {creditLookup && (
            <div style={{ marginTop: 14 }}>
              <div style={funnelRow}><span>User</span><strong><code>{creditLookup.user_id}</code></strong></div>
              <div style={funnelRow}><span>Current Stripe RMF balance</span><strong>{num(creditLookup.balance)}</strong></div>
              <div style={funnelRow}><span>Lifetime purchased</span><strong>{num(creditLookup.lifetime_purchased)}</strong></div>
              <div style={funnelRow}><span>Lifetime spent</span><strong>{num(creditLookup.lifetime_spent)}</strong></div>
              {!!creditLookup.recent_ledger?.length && (
                <div className="tableWrap" style={{ marginTop: 12 }}>
                  <table className="opsTable">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Reason</th>
                        <th>Action</th>
                        <th>Delta</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditLookup.recent_ledger.map((row) => (
                        <tr key={row.id}>
                          <td>{when(row.created_at)}</td>
                          <td>{row.reason}</td>
                          <td>{text(row.action)}</td>
                          <td>{row.delta}</td>
                          <td>{row.balance_after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        <section style={{ ...grid2, marginTop: 16 }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Plan & Stripe wiring</h2>
            <div style={funnelRow}><span>Active paid path</span><strong>RMF product credits (packs of {creditModel?.credits_per_pack ?? 100})</strong></div>
            <div style={funnelRow}><span>Credit price configured</span><strong>{stripe?.credit_price_configured ? "yes" : "no"}</strong></div>
            <div style={funnelRow}><span>Webhook configured</span><strong>{stripe?.webhook_configured ? "yes" : "no"}</strong></div>
            <div style={funnelRow}><span>Secret configured</span><strong>{stripe?.secret_configured ? "yes" : "no"}</strong></div>
            <div style={funnelRow}>
              <span>Premium subscription</span>
              <strong>{premiumConfigured ? "env configured" : "not configured"}</strong>
            </div>
            <div style={funnelRow}><span>Billing accounts</span><strong>{num(billing?.billing_accounts)}</strong></div>
            <div style={funnelRow}><span>Free-plan OAuth users</span><strong>{num(freePlanUsers)} · {premiumActive} premium</strong></div>
            {!premiumConfigured && (
              <p className="muted" style={{ marginBottom: 0 }}>
                Premium subscription checkout is disabled until <code>STRIPE_PRICE_ID_PREMIUM</code> is set. Do not advertise premium as available. Paid persistence maps to Stripe RMF credit spend only.
              </p>
            )}
            {premiumConfigured && (
              <p className="muted" style={{ marginBottom: 0 }}>
                Premium rows count only verified Stripe subscription entitlements. Stripe RMF credits remain the meter for Personal Network / memory Actions.
              </p>
            )}
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Vercel infrastructure (not product credits)</h2>
            <div style={funnelRow}><span>Hosting plan</span><strong>{infrastructure?.vercel_hosting?.plan || "Hobby"} · {infrastructure?.vercel_hosting?.status || "Active"}</strong></div>
            <div style={funnelRow}><span>Payment methods</span><strong>{infrastructure?.vercel_hosting?.payment_methods || "none"}</strong></div>
            <div style={funnelRow}><span>AI Gateway balance</span><strong>{money(infrastructure?.vercel_ai_gateway?.balance_usd ?? 0)}</strong></div>
            <div style={funnelRow}><span>AI Gateway auto-reload</span><strong>{infrastructure?.vercel_ai_gateway?.auto_reload ? "On" : "Off"}</strong></div>
            <p className="muted" style={{ marginBottom: 8 }}>
              {infrastructure?.vercel_ai_gateway?.note || "Vercel AI Gateway USD is not Rate My Face product credits."}
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {infrastructure?.nodejs_runtime_note || "Node.js 20 Vercel sidebar warnings are optional infra notes only."}
            </p>
          </div>
        </section>

        <section style={{ ...grid2, marginTop: 16 }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Metered Action usage · 30d</h2>
            {!billing?.usage_by_action_30d?.length ? (
              <p className="muted">No Stripe RMF credit ledger usage in the last 30 days yet.</p>
            ) : (
              billing.usage_by_action_30d.map((row) => (
                <div key={row.action} style={funnelRow}>
                  <span><code>{row.action}</code> · {num(row.events)} events</span>
                  <strong>{num(row.credits_spent)} RMF credits</strong>
                </div>
              ))
            )}
            <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>{billing?.revenue_mapping || "Paid persistence consumes Stripe RMF credits after verified purchase."}</p>
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Product vs infra cheat-sheet</h2>
            <div style={funnelRow}><span>Customer persistence meter</span><strong>Stripe RMF credits</strong></div>
            <div style={funnelRow}><span>Checkout Action</span><strong>createCreditCheckoutSession</strong></div>
            <div style={funnelRow}><span>Entitlements</span><strong>free vs premium (premium env-gated)</strong></div>
            <div style={funnelRow}><span>Vercel Hobby</span><strong>hosting only</strong></div>
            <div style={funnelRow}><span>Vercel AI Gateway</span><strong>infra USD — ignore for product ledger</strong></div>
            <p className="muted" style={{ marginBottom: 0 }}>{infrastructure?.product_credits?.note}</p>
          </div>
        </section>

        <section style={{ ...grid2, marginTop: 16 }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Acquisition & monetization</h2>
            <div style={funnelRow}><span>Public GPTs</span><strong>{portfolio?.public_gpts || 0}</strong></div>
            <div style={funnelRow}><span>Amazon-linked GPTs</span><strong>{portfolio?.amazon_linked_gpts || 0}</strong></div>
            <div style={funnelRow}><span>30-day affiliate clicks</span><strong>{num(amazon?.clicks)}</strong></div>
            <div style={funnelRow}><span>Ordered items</span><strong>{num(amazon?.ordered_items)}</strong></div>
            <div style={funnelRow}><span>Affiliate earnings</span><strong>{money(amazon?.earnings_usd)}</strong></div>
            <p className="muted" style={{ marginBottom: 0 }}>Amazon snapshot: {amazon ? `${text(amazon.period_start)} → ${text(amazon.period_end)}` : "not stored yet"}. Tagged searchProduct fallback remains the supported Creators workaround.</p>
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Account learning foundation</h2>
            <div style={funnelRow}><span>Supabase auth users</span><strong>{accounts?.auth_users || 0}</strong></div>
            <div style={funnelRow}><span>GPT OAuth users</span><strong>{accounts?.oauth_users || 0}</strong></div>
            <div style={funnelRow}><span>Active OAuth tokens</span><strong>{accounts?.active_oauth_tokens || 0}</strong></div>
            <div style={funnelRow}><span>Personal Network profiles</span><strong>{num(billing?.personal_profiles)}</strong></div>
            <div style={funnelRow}><span>Legacy memory contexts</span><strong>{num(billing?.memory_contexts)}</strong></div>
            <p className="muted" style={{ marginBottom: 0 }}>Account learning: instructions lead with MUST retrieve → getPersonalNetwork; remember/consent → updatePersonalNetwork / saveUserContext. Compare Me To Me stays off until persistence is verified.</p>
          </div>
        </section>

        {!!billing?.recent_credit_ledger?.length && (
          <section className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>Recent Stripe RMF credit ledger</h2>
            <div className="tableWrap">
              <table className="opsTable">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Reason</th>
                    <th>Action</th>
                    <th>Delta</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {billing.recent_credit_ledger.map((row) => (
                    <tr key={row.id}>
                      <td>{when(row.created_at)}</td>
                      <td><code>{row.user_id}</code></td>
                      <td>{row.reason}</td>
                      <td>{text(row.action)}</td>
                      <td>{row.delta}</td>
                      <td>{row.balance_after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

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
          <Status
            label="Stripe RMF credits"
            state={
              stripe?.secret_configured && stripe?.credit_price_configured && stripe?.webhook_configured
                ? "Secret + price + webhook"
                : "Incomplete"
            }
            ok={Boolean(stripe?.secret_configured && stripe?.credit_price_configured && stripe?.webhook_configured)}
          />
          <Status
            label="Premium subscription"
            state={premiumConfigured ? "Price configured" : "Not configured — RMF credits only"}
            ok={premiumConfigured}
          />
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

const sectionTitle: CSSProperties = { marginTop: 30, marginBottom: 12, fontSize: 22 };
const grid4: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 };
const funnelRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 20, padding: "10px 0", borderBottom: "1px solid #eee" };
const activity: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, padding: "11px 0", borderBottom: "1px solid #eee", alignItems: "flex-start" };
const pill: CSSProperties = { borderRadius: 999, padding: "6px 10px", fontSize: 13, fontWeight: 650, background: "#f2f4f7" };
const button: CSSProperties = { padding: "10px 14px", border: "1px solid #111", borderRadius: 8, background: "#111", color: "#fff", cursor: "pointer" };
const secondaryButton: CSSProperties = { ...button, background: "white", color: "#111" };
const linkButton: CSSProperties = { ...button, textDecoration: "none", display: "inline-block" };
const input: CSSProperties = { flex: 1, minWidth: 220, padding: "10px 12px", border: "1px solid #bbb", borderRadius: 8 };
