"use client";

import type { MetricValue } from "../../lib/metricValue";
import { formatMetric, metricNote } from "../../lib/metricValue";
import { MetricCard, MiniStat, SectionHeading, FunnelRow } from "./MetricCard";
import { grid4, grid2, when, text } from "./styles";

type BusinessOverview = {
  users: {
    total: MetricValue;
    active_7d: MetricValue;
    active_30d: MetricValue;
    new_signups_7d: MetricValue;
    new_signups_30d: MetricValue;
  };
  gpt_usage: {
    inventory: MetricValue;
    public_gpts: MetricValue;
    rate_my_face_chats: MetricValue;
    action_calls: MetricValue;
  };
  revenue: {
    amazon_clicks: MetricValue;
    amazon_revenue_usd: MetricValue;
    stripe_revenue_usd: MetricValue;
    credits_sold: MetricValue;
    credits_consumed: MetricValue;
  };
  learning: {
    profiles_created: MetricValue;
    interactions_stored: MetricValue;
    recommendations_stored: MetricValue;
    compare_jobs: MetricValue;
    social_connections: MetricValue;
  };
};

export function BusinessOverviewSection({ data }: { data: BusinessOverview }) {
  return (
    <>
      <SectionHeading
        id="overview"
        title="1. Business Overview"
        subtitle="Top-line users, GPT usage, revenue meters, and learning activity. Missing sources show Unavailable — never invented."
      />
      <h3 style={{ margin: "8px 0", fontSize: 15 }} className="muted">
        Users
      </h3>
      <section style={grid4}>
        <MetricCard label="Total users" metric={data.users.total} />
        <MetricCard label="Active 7d" metric={data.users.active_7d} />
        <MetricCard label="Active 30d" metric={data.users.active_30d} />
        <MetricCard label="New signups 7d / 30d" metric={data.users.new_signups_7d} fallbackNote={metricNote(data.users.new_signups_30d)} />
      </section>
      <p className="muted" style={{ marginTop: 8 }}>
        Signups 30d: <strong>{formatMetric(data.users.new_signups_30d)}</strong>
        {data.users.new_signups_30d?.available === false ? ` — ${data.users.new_signups_30d.reason}` : ""}
      </p>

      <h3 style={{ margin: "16px 0 8px", fontSize: 15 }} className="muted">
        GPT usage
      </h3>
      <section style={grid4}>
        <MetricCard label="GPT inventory" metric={data.gpt_usage.inventory} />
        <MetricCard label="Public GPTs" metric={data.gpt_usage.public_gpts} />
        <MetricCard label="Rate My Face chats" metric={data.gpt_usage.rate_my_face_chats} />
        <MetricCard label="Action calls" metric={data.gpt_usage.action_calls} />
      </section>

      <h3 style={{ margin: "16px 0 8px", fontSize: 15 }} className="muted">
        Revenue meters
      </h3>
      <section style={grid4}>
        <MetricCard label="Amazon clicks" metric={data.revenue.amazon_clicks} />
        <MetricCard label="Amazon revenue" metric={data.revenue.amazon_revenue_usd} />
        <MetricCard label="Stripe USD revenue" metric={data.revenue.stripe_revenue_usd} />
        <MetricCard label="Credits sold / consumed" metric={data.revenue.credits_sold} />
      </section>
      <p className="muted" style={{ marginTop: 8 }}>
        Credits consumed: <strong>{formatMetric(data.revenue.credits_consumed)}</strong> · Stripe USD stays Unavailable until mirrored — product meter is Stripe RMF credits.
      </p>

      <h3 style={{ margin: "16px 0 8px", fontSize: 15 }} className="muted">
        Learning
      </h3>
      <section style={grid4}>
        <MetricCard label="Profiles created" metric={data.learning.profiles_created} />
        <MetricCard label="Interactions stored" metric={data.learning.interactions_stored} />
        <MetricCard label="Recommendations stored" metric={data.learning.recommendations_stored} />
        <MetricCard label="Compare jobs" metric={data.learning.compare_jobs} />
        <MetricCard label="Social connections" metric={data.learning.social_connections} />
      </section>
    </>
  );
}

type CreditEconomy = {
  product_label: string;
  vercel_note: string;
  founder_grants: MetricValue;
  founder_grant_credits: MetricValue;
  signup_grants: MetricValue;
  stripe_packs_sold: MetricValue;
  stripe_pack_credits: MetricValue;
  stripe_events: MetricValue;
  usage_consumed: MetricValue;
  remaining_balance: MetricValue;
  top_ops: Array<{ action: string; events: number; credits_spent: number }>;
  recent_ledger: Array<{
    id: number;
    user_id: string;
    delta: number;
    balance_after: number;
    reason: string;
    action: string | null;
    created_at: string;
  }>;
  tables: string[];
};

export function CreditEconomySection({
  data,
  children
}: {
  data: CreditEconomy;
  children?: React.ReactNode;
}) {
  return (
    <>
      <SectionHeading
        id="credits"
        title="2. Credit Economy"
        subtitle={`${data.product_label}. ${data.vercel_note} Tables: ${data.tables.join(", ")}. Every mutation must write rmf_credit_ledger.`}
      />
      <section style={grid4}>
        <MetricCard label="Founder grants" metric={data.founder_grants} />
        <MetricCard label="Founder grant credits" metric={data.founder_grant_credits} />
        <MetricCard label="Signup grants" metric={data.signup_grants} />
        <MetricCard label="Stripe packs sold" metric={data.stripe_packs_sold} />
        <MetricCard label="Pack credits granted" metric={data.stripe_pack_credits} />
        <MetricCard label="Stripe events" metric={data.stripe_events} />
        <MetricCard label="Usage consumed" metric={data.usage_consumed} />
        <MetricCard label="Remaining balance" metric={data.remaining_balance} />
      </section>

      <section style={{ ...grid2, marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Top ops · 30d</h3>
          {!data.top_ops?.length ? (
            <p className="muted">No Stripe RMF credit ledger usage in the last 30 days yet.</p>
          ) : (
            data.top_ops.map((row) => (
              <FunnelRow
                key={row.action}
                label={
                  <>
                    <code>{row.action}</code> · {row.events.toLocaleString()} events
                  </>
                }
                value={`${row.credits_spent.toLocaleString()} RMF credits`}
              />
            ))
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Actions</h3>
          <FunnelRow label="Grant founder credits" value="enabled (audited)" />
          <FunnelRow label="View ledger" value="enabled" />
          <FunnelRow label="Revoke suspicious grants" value="enabled (audited)" />
          <FunnelRow label="Inspect consumption" value="lookup + ledger" />
          <FunnelRow label="Auto-mutate without audit" value="forbidden" />
        </div>
      </section>

      {children}

      {!!data.recent_ledger?.length && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Recent Stripe RMF credit ledger</h3>
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
                {data.recent_ledger.map((row) => (
                  <tr key={row.id}>
                    <td>{when(row.created_at)}</td>
                    <td>
                      <code>{row.user_id}</code>
                    </td>
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
    </>
  );
}

export function GptPortfolioSection({
  summary,
  gpts
}: {
  summary: { active: number; draft: number; public: number; action_gpts: number; amazon_linked: number };
  gpts: Array<{
    id: number;
    gpt_key: string;
    name: string;
    status: string;
    visibility: string;
    actions: boolean;
    amazon_links: boolean;
    chats_reported: MetricValue;
    retention: MetricValue;
    revenue: MetricValue;
    amazon_tracking_id: string;
  }>;
}) {
  return (
    <>
      <SectionHeading
        id="gpt-portfolio"
        title="3. GPT Portfolio Manager"
        subtitle="Rate My Face / My One Product / other GPTs. DB: rmf_agent_gpts, rmf_agent_runs, rmf_agent_signals."
      />
      <section className="card">
        <div style={grid4}>
          <MiniStat label="Active" value={summary.active} />
          <MiniStat label="Drafts" value={summary.draft} />
          <MiniStat label="Public" value={summary.public} />
          <MiniStat label="Amazon-linked" value={summary.amazon_linked} />
        </div>
        <div className="tableWrap" style={{ marginTop: 18 }}>
          <table className="opsTable">
            <thead>
              <tr>
                <th>GPT</th>
                <th>Status</th>
                <th>Visibility</th>
                <th>Actions</th>
                <th>Chats</th>
                <th>Retention</th>
                <th>Revenue</th>
                <th>Tracking ID</th>
              </tr>
            </thead>
            <tbody>
              {gpts.map((g) => (
                <tr key={g.id}>
                  <td>
                    <strong>{g.name}</strong>
                    <div className="muted">
                      <code>{g.gpt_key}</code>
                    </div>
                  </td>
                  <td>{g.status}</td>
                  <td>{g.visibility}</td>
                  <td>{g.actions ? "yes" : "no"}</td>
                  <td>{formatMetric(g.chats_reported)}</td>
                  <td>{formatMetric(g.retention)}</td>
                  <td>{formatMetric(g.revenue)}</td>
                  <td>
                    <code>{g.amazon_tracking_id}</code>
                  </td>
                </tr>
              ))}
              {!gpts.length && (
                <tr>
                  <td colSpan={8} className="muted">
                    No GPTs in rmf_agent_gpts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
