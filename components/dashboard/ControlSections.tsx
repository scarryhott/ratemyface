"use client";

import type { MetricValue } from "../../lib/metricValue";
import { formatMetric } from "../../lib/metricValue";
import { MetricCard, SectionHeading, FunnelRow, StatusCard } from "./MetricCard";
import { grid4, grid2, activity, when, money, num, text } from "./styles";

type LearningConsole = {
  users_with_profiles: MetricValue;
  observations: MetricValue;
  recommendations: MetricValue;
  interactions: MetricValue;
  learning_events: MetricValue;
  recent_profiles: Array<{
    user_id: string;
    updated_at: string;
    consent_personalization?: boolean | null;
  }>;
  tables: string[];
  admin_note: string;
};

export function LearningConsoleSection({ data }: { data: LearningConsole }) {
  return (
    <>
      <SectionHeading
        id="learning"
        title="4. Account Learning Console"
        subtitle={`Tables: ${data.tables.join(", ")}. ${data.admin_note}`}
      />
      <section style={grid4}>
        <MetricCard label="Users / profiles" metric={data.users_with_profiles} />
        <MetricCard label="Observations" metric={data.observations} />
        <MetricCard label="Recommendations" metric={data.recommendations} />
        <MetricCard label="Interactions" metric={data.interactions} />
        <MetricCard label="Learning events" metric={data.learning_events} />
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Recent personal profiles</h3>
        {!data.recent_profiles?.length ? (
          <p className="muted">No personal profiles yet.</p>
        ) : (
          data.recent_profiles.map((p) => (
            <div key={`${p.user_id}-${p.updated_at}`} style={activity}>
              <div>
                <strong>
                  <code>{p.user_id}</code>
                </strong>
                <div className="muted">Admin drill-down expands in PR #21</div>
              </div>
              <small>{when(p.updated_at)}</small>
            </div>
          ))
        )}
      </section>
    </>
  );
}

type CompareControl = {
  status: "DISABLED" | "TESTING" | "LIVE" | "PAID";
  enabled: boolean;
  jobs_queued: MetricValue;
  jobs_running: MetricValue;
  jobs_completed: MetricValue;
  results: MetricValue;
  gate: string;
  future_tables: string[];
  schema_ready?: boolean;
  vision_status?: string;
  action_path?: string;
};

export function CompareControlSection({ data }: { data: CompareControl }) {
  return (
    <>
      <SectionHeading
        id="compare"
        title="5. Compare Me To Me Control Center"
        subtitle={data.gate}
      />
      <section className="card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span
            style={{
              borderRadius: 999,
              padding: "6px 12px",
              fontWeight: 700,
              background: "#f2f4f7",
              color: "#344054"
            }}
          >
            Status: {data.status}
          </span>
          <span className="muted">
            enabled={String(data.enabled)} · schema=
            {data.schema_ready ? "ready" : "pending"} · vision=
            {data.vision_status || "limited"} · tables: {data.future_tables.join(", ")}
          </span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Paid compareMeToMe Action (OAuth + credits). Status PAID is not a LIVE unlimited-vision
          marketing claim. Unauthenticated compare is not free. Job counts are live table rows —
          never invented.
        </p>
        <section style={grid4}>
          <MetricCard label="Jobs queued" metric={data.jobs_queued} />
          <MetricCard label="Jobs running" metric={data.jobs_running} />
          <MetricCard label="Jobs completed" metric={data.jobs_completed} />
          <MetricCard label="Results" metric={data.results} />
        </section>
      </section>
    </>
  );
}

type AppearanceAgentControl = {
  status: "DISABLED" | "TESTING" | "LIVE";
  enabled: false;
  plans_total: MetricValue;
  plans_draft: MetricValue;
  plans_active: MetricValue;
  checkins: MetricValue;
  gate: string;
  future_tables: string[];
  schema_ready?: boolean;
  note: string;
  target_days: number;
  depends_on: string[];
};

export function AppearanceAgentSection({ data }: { data: AppearanceAgentControl }) {
  return (
    <>
      <SectionHeading
        id="appearance-agent"
        title="5c. Appearance Agent"
        subtitle={data.gate}
      />
      <section className="card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span
            style={{
              borderRadius: 999,
              padding: "6px 12px",
              fontWeight: 700,
              background: "#f2f4f7",
              color: "#344054"
            }}
          >
            Status: {data.status}
          </span>
          <span className="muted">
            enabled={String(data.enabled)} · schema=
            {data.schema_ready ? "ready" : "pending"} · {data.target_days}-day loop · tables:{" "}
            {data.future_tables.join(", ")}
          </span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          <strong>Not LIVE paid coaching.</strong> {data.note} Depends on:{" "}
          {data.depends_on.join(", ")}. Plan/check-in counts are live empties (expect 0) or
          Unavailable — no fake numbers. Credits will meter future paid ops.
        </p>
        <section style={grid4}>
          <MetricCard label="Plans (total)" metric={data.plans_total} />
          <MetricCard label="Plans draft" metric={data.plans_draft} />
          <MetricCard label="Plans active" metric={data.plans_active} />
          <MetricCard label="Check-ins" metric={data.checkins} />
        </section>
      </section>
    </>
  );
}

type SocialProvidersControl = {
  status: "UNAVAILABLE" | "NOT_CONFIGURED" | "LIVE";
  enabled: false;
  oauth_ready: false;
  scraping: false;
  auth_mode: string;
  planned: string[];
  connection_rows: MetricValue;
  connected: MetricValue;
  revoked: MetricValue;
  gate: string;
  table: string;
  schema_ready: boolean;
  note: string;
};

export function SocialProvidersSection({ data }: { data: SocialProvidersControl }) {
  return (
    <>
      <SectionHeading
        id="social"
        title="5b. Social Provider Connections"
        subtitle={data.gate}
      />
      <section className="card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span
            style={{
              borderRadius: 999,
              padding: "6px 12px",
              fontWeight: 700,
              background: "#f2f4f7",
              color: "#344054"
            }}
          >
            Status: {data.status}
          </span>
          <span className="muted">
            enabled={String(data.enabled)} · oauth_ready={String(data.oauth_ready)} · scraping=
            {String(data.scraping)} · schema={data.schema_ready ? "ready" : "pending"} · table:{" "}
            {data.table}
          </span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {data.note} Planned: {data.planned.join(", ")}. Counts are live empties (expect 0) or
          Unavailable — no fake metrics. No live social OAuth until secrets are configured.
        </p>
        <section style={grid4}>
          <MetricCard label="Connection rows" metric={data.connection_rows} />
          <MetricCard label="Connected" metric={data.connected} />
          <MetricCard label="Revoked" metric={data.revoked} />
          <div className="card" style={{ minHeight: 122 }}>
            <div className="muted" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Auth mode
            </div>
            <div style={{ fontSize: 18, fontWeight: 750, margin: "8px 0", color: "#111" }}>
              {data.auth_mode}
            </div>
            <div className="muted">stubs: /api/providers · connect · disconnect</div>
          </div>
        </section>
      </section>
    </>
  );
}

type RevenueDashboard = {
  amazon_tag: string;
  amazon_attribution: string;
  amazon_clicks: MetricValue;
  amazon_ordered_items: MetricValue;
  amazon_earnings_usd: MetricValue;
  stripe_products: string;
  stripe_purchases: MetricValue;
  stripe_refunds: MetricValue;
  stripe_usage_events: MetricValue;
  stripe_events_processed: MetricValue;
  tables: string[];
  product_vs_infra: string;
};

export function RevenueSection({ data }: { data: RevenueDashboard }) {
  return (
    <>
      <SectionHeading
        id="revenue"
        title="6. Revenue Dashboard"
        subtitle={`${data.amazon_attribution} Tables: ${data.tables.join(", ")}.`}
      />
      <section style={{ ...grid2 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Amazon · tag {data.amazon_tag}</h3>
          <FunnelRow label="Clicks" value={formatMetric(data.amazon_clicks)} />
          <FunnelRow label="Ordered items" value={formatMetric(data.amazon_ordered_items)} />
          <FunnelRow
            label="Earnings"
            value={
              data.amazon_earnings_usd.available
                ? money(data.amazon_earnings_usd.value)
                : "Unavailable"
            }
          />
          {!data.amazon_clicks.available && (
            <p className="muted" style={{ marginBottom: 0 }}>
              {data.amazon_clicks.reason}
            </p>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Stripe product credits</h3>
          <FunnelRow label="Products" value={data.stripe_products} />
          <FunnelRow label="Purchases (packs)" value={formatMetric(data.stripe_purchases)} />
          <FunnelRow label="Refunds" value={formatMetric(data.stripe_refunds)} />
          <FunnelRow label="Usage events" value={formatMetric(data.stripe_usage_events)} />
          <FunnelRow label="Webhook events" value={formatMetric(data.stripe_events_processed)} />
          <p className="muted" style={{ marginBottom: 0 }}>{data.product_vs_infra}</p>
        </div>
      </section>
    </>
  );
}

type OpsHealth = {
  vercel: { status: string; note: string };
  supabase: { status: string; note: string };
  railway: { status: string; note: string };
  github: { status: string; note: string };
  actions: { status: string; note: string };
  stripe: { status: string; note: string };
  latest_deploy_sha: string | null;
  recent_errors: Array<{ id: number; model: string | null; error: string | null; created_at: string }>;
  failed_actions: MetricValue;
  auth_failures: MetricValue;
  pending_approvals: number;
};

export function OpsHealthSection({
  data,
  ownerSignedIn,
  stripeConfigured,
  databaseConfigured
}: {
  data: OpsHealth;
  ownerSignedIn: boolean;
  stripeConfigured: boolean;
  databaseConfigured: boolean;
}) {
  const healthy = (status: string) =>
    status === "configured" || status === "connected" || status === "hobby_active" || status === "assumed_connected";

  return (
    <>
      <SectionHeading
        id="ops-health"
        title="7. Operations Health"
        subtitle="Vercel / Supabase / Railway / GitHub / Actions / Stripe. Missing live probes are labeled clearly."
      />
      <section style={grid4}>
        <StatusCard label="Vercel" state={`${data.vercel.status}`} ok={healthy(data.vercel.status)} />
        <StatusCard label="Supabase" state={data.supabase.status} ok={healthy(data.supabase.status)} />
        <StatusCard label="Railway" state={data.railway.status} ok={healthy(data.railway.status)} />
        <StatusCard label="GitHub" state={data.github.status} ok={healthy(data.github.status)} />
        <StatusCard label="GPT Actions" state={data.actions.status} ok={healthy(data.actions.status)} />
        <StatusCard label="Stripe RMF credits" state={data.stripe.status} ok={healthy(data.stripe.status)} />
        <StatusCard label="Owner auth" state={ownerSignedIn ? "Google session active" : "Not signed in"} ok={ownerSignedIn} />
        <StatusCard
          label="Latest deploy SHA"
          state={data.latest_deploy_sha || "Unavailable"}
          ok={Boolean(data.latest_deploy_sha)}
        />
      </section>

      <section style={{ ...grid2, marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Health notes</h3>
          <FunnelRow label="Vercel" value={data.vercel.note} />
          <FunnelRow label="Supabase" value={data.supabase.note} />
          <FunnelRow label="Railway" value={data.railway.note} />
          <FunnelRow label="Actions" value={data.actions.note} />
          <FunnelRow label="Stripe" value={text(data.stripe.note).slice(0, 120)} />
          <FunnelRow label="Pending approvals" value={num(data.pending_approvals)} />
          <FunnelRow label="Failed agent runs" value={formatMetric(data.failed_actions)} />
          <FunnelRow label="Auth failures" value={formatMetric(data.auth_failures)} />
          <FunnelRow label="DB configured" value={databaseConfigured ? "yes" : "no"} />
          <FunnelRow label="Stripe product wired" value={stripeConfigured ? "secret+price+webhook" : "incomplete"} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent errors</h3>
          {!data.recent_errors?.length ? (
            <p className="muted">No failed/error agent runs in the recent window.</p>
          ) : (
            data.recent_errors.map((r) => (
              <div key={r.id} style={activity}>
                <div>
                  <strong>Run #{r.id}</strong>
                  <div className="muted">{r.model || "model n/a"} · {r.error || "error"}</div>
                </div>
                <small>{when(r.created_at)}</small>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
