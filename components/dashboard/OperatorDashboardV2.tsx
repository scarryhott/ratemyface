"use client";

import { useEffect, useState } from "react";
import {
  BusinessOverviewSection,
  CreditEconomySection,
  GptPortfolioSection
} from "./BusinessSections";
import {
  LearningConsoleSection,
  CompareControlSection,
  RevenueSection,
  OpsHealthSection
} from "./ControlSections";
import { FounderCreditPanel } from "./FounderCreditPanel";
import {
  pill,
  button,
  secondaryButton,
  linkButton,
  input,
  navTabs,
  tabLink,
  when,
  funnelRow,
  grid2
} from "./styles";

type Owner = { id: string; method: string; email?: string; phone?: string; wallet?: string };

type DashboardPayload = {
  ok: boolean;
  version?: string;
  database_configured?: boolean;
  generated_at?: string;
  actor?: string;
  owner?: Owner | null;
  error?: string;
  business_overview?: any;
  credit_economy?: any;
  gpt_portfolio?: any;
  learning_console?: any;
  compare_me_to_me?: any;
  revenue_dashboard?: any;
  operations_health?: any;
  ops?: any;
};

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "credits", label: "Credits" },
  { id: "gpt-portfolio", label: "GPT portfolio" },
  { id: "learning", label: "Learning" },
  { id: "compare", label: "Compare" },
  { id: "revenue", label: "Revenue" },
  { id: "ops-health", label: "Ops health" }
];

export default function OperatorDashboardV2() {
  const [secret, setSecret] = useState("");
  const [owner, setOwner] = useState<Owner | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
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
    return body.owner as Owner;
  }

  async function loadDashboard(currentSecret = secret) {
    setLoading(true);
    setError("");
    try {
      const headers = new Headers();
      if (currentSecret) headers.set("Authorization", `Bearer ${currentSecret}`);
      const response = await fetch("/api/operator/dashboard", {
        headers,
        cache: "no-store",
        credentials: "same-origin"
      });
      const body = (await response.json().catch(() => ({
        ok: false,
        error: `HTTP_${response.status}`
      }))) as DashboardPayload;
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      setData(body);
      if (body.owner) setOwner(body.owner);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function authHeaders() {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (secret) headers.set("Authorization", `Bearer ${secret}`);
    return headers;
  }

  useEffect(() => {
    void (async () => {
      const current = await loadOwner();
      if (current) await loadDashboard("");
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await fetch("/api/operator/owner/session", { method: "DELETE", credentials: "same-origin" });
    setOwner(null);
    setData(null);
  }

  const ops = data?.ops;
  const billing = ops?.billing;
  const infrastructure = ops?.infrastructure;
  const stripe = billing?.stripe;
  const creditModel = billing?.credit_model;
  const businessHealth = error
    ? "Needs attention"
    : data?.database_configured
      ? "Operational"
      : data
        ? "Waiting for data"
        : "Sign in required";
  const premiumConfigured = Boolean(stripe?.subscription_price_configured);
  const stripeProductOk = Boolean(
    stripe?.secret_configured && stripe?.credit_price_configured && stripe?.webhook_configured
  );
  const productCreditLabel =
    data?.credit_economy?.product_label ||
    creditModel?.label ||
    infrastructure?.product_credits?.label ||
    "Rate My Face product credits (Stripe ledger)";

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 60 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20
        }}
      >
        <div>
          <p style={{ marginBottom: 8 }}>
            <a href="/operator">← Operator console</a>
          </p>
          <h1 style={{ margin: 0, fontSize: 36 }}>Rate My Face Business · Dashboard v2</h1>
          <p className="muted" style={{ maxWidth: 780 }}>
            Owner-only business controller: overview, credit economy, GPT portfolio, Account Learning, Compare Me To Me
            (disabled), revenue, and ops health. {productCreditLabel}. Vercel Hobby / AI Gateway are infrastructure — not
            product credits.
          </p>
        </div>
        <div
          style={{
            ...pill,
            background: data?.database_configured ? "#ecfdf3" : "#fff7ed",
            color: data?.database_configured ? "#067647" : "#b54708"
          }}
        >
          {businessHealth}
        </div>
      </div>

      <section
        className="card"
        style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap" }}
      >
        <div>
          {owner ? (
            <>
              <strong>{owner.email || owner.phone || owner.wallet || owner.id}</strong>
              <div className="muted">Owner session · {owner.method}</div>
            </>
          ) : (
            <div>Owner sign-in required for live business data.</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {owner ? (
            <>
              <button style={button} onClick={() => loadDashboard()} disabled={loading}>
                {loading ? "Refreshing…" : "Refresh data"}
              </button>
              <button style={secondaryButton} onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <a style={linkButton} href="/operator/login?next=/operator/dashboard">
              Sign in with Google
            </a>
          )}
        </div>
        {!owner && (
          <div style={{ width: "100%", display: "flex", gap: 8 }}>
            <input
              type="password"
              placeholder="Machine/operator secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              style={input}
            />
            <button style={button} disabled={!secret || loading} onClick={() => loadDashboard()}>
              Load
            </button>
          </div>
        )}
      </section>

      <nav style={navTabs} aria-label="Dashboard sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} style={tabLink}>
            {s.label}
          </a>
        ))}
      </nav>

      {error && (
        <section className="card" style={{ borderColor: "#f04438" }}>
          <strong>Dashboard error:</strong> {error}
        </section>
      )}

      {data?.business_overview && (
        <>
          <BusinessOverviewSection data={data.business_overview} />

          {data.credit_economy && (
            <CreditEconomySection data={data.credit_economy}>
              <FounderCreditPanel
                canMutate={Boolean(owner || secret)}
                authHeaders={authHeaders}
                onMutated={() => loadDashboard()}
                signupCredits={creditModel?.signup_credits ?? 100}
                packSize={creditModel?.credits_per_pack ?? 100}
              />
            </CreditEconomySection>
          )}

          <section style={{ ...grid2, marginTop: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Plan & Stripe wiring</h3>
              <div style={funnelRow}>
                <span>Active paid path</span>
                <strong>RMF product credits (packs of {creditModel?.credits_per_pack ?? 100})</strong>
              </div>
              <div style={funnelRow}>
                <span>Credit price configured</span>
                <strong>{stripe?.credit_price_configured ? "yes" : "no"}</strong>
              </div>
              <div style={funnelRow}>
                <span>Webhook configured</span>
                <strong>{stripe?.webhook_configured ? "yes" : "no"}</strong>
              </div>
              <div style={funnelRow}>
                <span>Secret configured</span>
                <strong>{stripe?.secret_configured ? "yes" : "no"}</strong>
              </div>
              <div style={funnelRow}>
                <span>Premium subscription</span>
                <strong>{premiumConfigured ? "env configured" : "not configured"}</strong>
              </div>
              {!premiumConfigured && (
                <p className="muted" style={{ marginBottom: 0 }}>
                  Premium subscription checkout is disabled until <code>STRIPE_PRICE_ID_PREMIUM</code> is set. Paid
                  persistence maps to Stripe RMF credit spend only.
                </p>
              )}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Vercel infrastructure (not product credits)</h3>
              <div style={funnelRow}>
                <span>Hosting plan</span>
                <strong>
                  {infrastructure?.vercel_hosting?.plan || "Hobby"} · {infrastructure?.vercel_hosting?.status || "Active"}
                </strong>
              </div>
              <div style={funnelRow}>
                <span>AI Gateway balance</span>
                <strong>
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                    Number(infrastructure?.vercel_ai_gateway?.balance_usd ?? 0)
                  )}
                </strong>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                {infrastructure?.vercel_ai_gateway?.note ||
                  "Vercel AI Gateway USD is not Rate My Face product credits."}
              </p>
            </div>
          </section>

          {data.gpt_portfolio && (
            <GptPortfolioSection summary={data.gpt_portfolio.summary} gpts={data.gpt_portfolio.gpts || []} />
          )}

          {data.learning_console && <LearningConsoleSection data={data.learning_console} />}
          {data.compare_me_to_me && <CompareControlSection data={data.compare_me_to_me} />}
          {data.revenue_dashboard && <RevenueSection data={data.revenue_dashboard} />}
          {data.operations_health && (
            <OpsHealthSection
              data={data.operations_health}
              ownerSignedIn={Boolean(owner)}
              stripeConfigured={stripeProductOk}
              databaseConfigured={Boolean(data.database_configured)}
            />
          )}

          {!!ops?.recent_runs?.length && (
            <section className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Recent agent runs</h3>
              {ops.recent_runs.slice(0, 8).map((r: any) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "11px 0",
                    borderBottom: "1px solid #eee"
                  }}
                >
                  <div>
                    <strong>Run #{r.id}</strong> · {r.status}
                    <div className="muted">
                      {r.model || "model n/a"} · L{r.authority} · {r.closure_state || "closure n/a"}
                    </div>
                  </div>
                  <small>{when(r.created_at)}</small>
                </div>
              ))}
            </section>
          )}

          <p className="muted">
            Generated {when(data.generated_at)}
            {data.actor ? ` · actor ${data.actor}` : ""} · {data.version || "dashboard_v2"}
          </p>
        </>
      )}
    </main>
  );
}
