import { databaseConfigured, db } from "./db";
import { ensureOperatorSchema } from "./operatorAgent";
import { creditsPerPack, signupCredits } from "./stripeBilling";
import type { OperatorModelPlan } from "./operatorClosure";

export type BusinessMetricsSnapshot = {
  captured_at: string;
  database_configured: boolean;
  auth_users: number | null;
  oauth_users: number | null;
  personal_profiles: number | null;
  interactions: number | null;
  credit_balance_total: number | null;
  lifetime_purchased: number | null;
  lifetime_spent: number | null;
  stripe_events: number | null;
  agent_runs_7d: number | null;
  agent_signals_queued: number | null;
  pending_approvals: number | null;
  compare_enabled: false;
  credits_per_pack: number;
  signup_credits: number;
  amazon_tag: string;
  commercial_loop: string;
  notes: string[];
};

export type BusinessStrategyReport = {
  id: string;
  created_at: string;
  source: string;
  kind: string;
  run_id: number | null;
  signal_id: number | null;
  summary: string;
  bottleneck: string;
  hypothesis: string;
  recommended_next_step: string;
  expected_metric_effect: string;
  funnel_stage: string;
  confidence: string;
  observations: string[];
  metrics_before: BusinessMetricsSnapshot | null;
  status: string;
  closure_state: string | null;
};

async function tableExists(sql: any, name: string): Promise<boolean> {
  const rows = await sql`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = ${name}
    limit 1
  `;
  return rows.length > 0;
}

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Lightweight business snapshot for agent planning + dashboard strategy impact. */
export async function snapshotBusinessMetrics(): Promise<BusinessMetricsSnapshot> {
  const notes: string[] = [];
  const base: BusinessMetricsSnapshot = {
    captured_at: new Date().toISOString(),
    database_configured: databaseConfigured(),
    auth_users: null,
    oauth_users: null,
    personal_profiles: null,
    interactions: null,
    credit_balance_total: null,
    lifetime_purchased: null,
    lifetime_spent: null,
    stripe_events: null,
    agent_runs_7d: null,
    agent_signals_queued: null,
    pending_approvals: null,
    compare_enabled: false,
    credits_per_pack: creditsPerPack(),
    signup_credits: signupCredits(),
    amazon_tag: "ratemyfacegpt-20",
    commercial_loop:
      "free GPT acquisition → useful Action → account → persistent value → credits/payment → feedback/retention → experiment → improved Action → measured profit → bounded reinvestment",
    notes
  };

  if (!databaseConfigured()) {
    notes.push("Database not configured — metrics unavailable.");
    return base;
  }

  await ensureOperatorSchema();
  const sql = db();

  try {
    const auth = await sql`select count(*)::int as total from auth.users`;
    base.auth_users = asNumber(auth[0]?.total);
  } catch {
    notes.push("auth.users not readable");
  }

  try {
    const oauth = await sql`select count(distinct user_id)::int as total from rmf_oauth_tokens`;
    base.oauth_users = asNumber(oauth[0]?.total);
  } catch {
    notes.push("rmf_oauth_tokens unavailable");
  }

  if (await tableExists(sql, "rmf_personal_profiles")) {
    const rows = await sql`select count(*)::int as total from rmf_personal_profiles`;
    base.personal_profiles = asNumber(rows[0]?.total);
  } else notes.push("rmf_personal_profiles missing");

  if (await tableExists(sql, "rmf_interactions")) {
    const rows = await sql`select count(*)::int as total from rmf_interactions`;
    base.interactions = asNumber(rows[0]?.total);
  } else notes.push("rmf_interactions missing");

  if (await tableExists(sql, "rmf_credit_accounts")) {
    const rows = await sql`
      select coalesce(sum(balance),0)::bigint as balance,
             coalesce(sum(lifetime_purchased),0)::bigint as purchased,
             coalesce(sum(lifetime_spent),0)::bigint as spent
      from rmf_credit_accounts
    `;
    base.credit_balance_total = asNumber(rows[0]?.balance);
    base.lifetime_purchased = asNumber(rows[0]?.purchased);
    base.lifetime_spent = asNumber(rows[0]?.spent);
  } else notes.push("rmf_credit_accounts missing");

  if (await tableExists(sql, "rmf_stripe_events")) {
    const rows = await sql`select count(*)::int as total from rmf_stripe_events`;
    base.stripe_events = asNumber(rows[0]?.total);
  }

  try {
    const runs = await sql`
      select count(*)::int as total from rmf_agent_runs
      where created_at >= now() - interval '7 days'
    `;
    base.agent_runs_7d = asNumber(runs[0]?.total);
    const queued = await sql`select count(*)::int as total from rmf_agent_signals where status='queued'`;
    base.agent_signals_queued = asNumber(queued[0]?.total);
    const approvals = await sql`select count(*)::int as total from rmf_agent_approvals where status='pending'`;
    base.pending_approvals = asNumber(approvals[0]?.total);
  } catch {
    notes.push("agent ops tables partially unavailable");
  }

  notes.push("ChatGPT chat counts and Amazon Associates live revenue are not ingested — leave Unavailable rather than inventing.");
  notes.push("Compare Me To Me remains disabled until image storage + consent + history exist.");
  return base;
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function extractBusinessImpact(
  plan: OperatorModelPlan | null | undefined,
  payload: Record<string, unknown> = {}
): Omit<BusinessStrategyReport, "id" | "created_at" | "source" | "kind" | "run_id" | "signal_id" | "metrics_before" | "status" | "closure_state"> {
  const impact = record((plan as any)?.business_impact);
  const fromPayload = record(payload.business_impact);
  const summary = String(plan?.summary || fromPayload.summary || "").slice(0, 4000);
  return {
    summary,
    bottleneck: String(impact.bottleneck || fromPayload.bottleneck || "unresolved").slice(0, 500),
    hypothesis: String(impact.hypothesis || fromPayload.hypothesis || "").slice(0, 1000),
    recommended_next_step: String(
      impact.recommended_next_step || fromPayload.recommended_next_step || ""
    ).slice(0, 1000),
    expected_metric_effect: String(
      impact.expected_metric_effect || fromPayload.expected_metric_effect || ""
    ).slice(0, 1000),
    funnel_stage: String(impact.funnel_stage || fromPayload.funnel_stage || "unknown").slice(0, 120),
    confidence: String(impact.confidence || fromPayload.confidence || "low").slice(0, 40),
    observations: Array.isArray(plan?.observations) ? plan!.observations.slice(0, 20) : []
  };
}

/** Persist latest + history strategy reports for dashboard visibility. */
export async function writeStrategyReport(
  report: BusinessStrategyReport
): Promise<BusinessStrategyReport> {
  await ensureOperatorSchema();
  const sql = db();
  await sql`
    insert into rmf_agent_context(key, value, updated_at)
    values('business_strategy:latest', ${sql.json(report as any)}, now())
    on conflict(key) do update set value = excluded.value, updated_at = now()
  `;

  const historyRows = await sql`
    select value from rmf_agent_context where key = 'business_strategy:history' limit 1
  `;
  const existing = Array.isArray(historyRows[0]?.value) ? (historyRows[0].value as any[]) : [];
  const next = [report, ...existing].slice(0, 40);
  await sql`
    insert into rmf_agent_context(key, value, updated_at)
    values('business_strategy:history', ${sql.json(next as any)}, now())
    on conflict(key) do update set value = excluded.value, updated_at = now()
  `;
  return report;
}

export async function readStrategyReports(limit = 12): Promise<{
  latest: BusinessStrategyReport | null;
  history: BusinessStrategyReport[];
}> {
  if (!databaseConfigured()) return { latest: null, history: [] };
  await ensureOperatorSchema();
  const sql = db();
  const latestRows = await sql`
    select value, updated_at from rmf_agent_context where key = 'business_strategy:latest' limit 1
  `;
  const historyRows = await sql`
    select value from rmf_agent_context where key = 'business_strategy:history' limit 1
  `;
  const latest = latestRows[0]?.value
    ? ({ ...(latestRows[0].value as object), created_at: String((latestRows[0].value as any).created_at || latestRows[0].updated_at) } as BusinessStrategyReport)
    : null;
  const history = Array.isArray(historyRows[0]?.value)
    ? (historyRows[0].value as BusinessStrategyReport[]).slice(0, Math.min(Math.max(limit, 1), 40))
    : latest
      ? [latest]
      : [];
  return { latest, history };
}

export async function recordStrategyFromRun(input: {
  source: string;
  kind: string;
  runId: number;
  signalId: number;
  status: string;
  closureState?: string | null;
  plan: OperatorModelPlan | null;
  payload?: Record<string, unknown>;
  metricsBefore?: BusinessMetricsSnapshot | null;
}): Promise<BusinessStrategyReport | null> {
  const kinds = new Set(["heartbeat", "business_improve", "owner_chat", "manual"]);
  if (!kinds.has(String(input.kind))) return null;
  if (!input.plan?.summary && !record(input.payload || {}).message) return null;

  const impact = extractBusinessImpact(input.plan, input.payload || {});
  if (!impact.summary && !impact.bottleneck) return null;

  const report: BusinessStrategyReport = {
    id: `bsr_${input.runId}_${Date.now()}`,
    created_at: new Date().toISOString(),
    source: String(input.source).slice(0, 80),
    kind: String(input.kind).slice(0, 80),
    run_id: input.runId,
    signal_id: input.signalId,
    ...impact,
    metrics_before: input.metricsBefore || null,
    status: input.status,
    closure_state: input.closureState || null
  };
  return writeStrategyReport(report);
}

export function businessImproveGoal(): string {
  return [
    "Autonomous business improve cycle for Rate My Face.",
    "Review the full commercial loop and current metrics snapshot.",
    "Identify the highest-value bottleneck (acquisition, Action usefulness, account learning, credits/payment, retention, or ops).",
    "Propose one reversible next step at minimum authority.",
    "Return JSON including business_impact:{bottleneck,hypothesis,recommended_next_step,expected_metric_effect,funnel_stage,confidence}.",
    "Do not invent ChatGPT chat counts, Amazon revenue, or Stripe USD. Label missing sources Unavailable.",
    "Compare Me To Me stays DISABLED. Prefer Account Learning + credit economy closure over new features.",
    "Report clearly how the recommended strategy helps the business."
  ].join(" ");
}
