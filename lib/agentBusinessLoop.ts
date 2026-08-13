import {
  classifyCycle,
  deriveBacklog,
  inspectRepoEvidence,
  loadFeatureBacklogSpec,
  newFeatureReceipt,
  selectHighestPriorityUnfinished,
  type BacklogItemView,
  type FeatureReceipt,
  type ManagerialDecision,
  type ProductionHealthEvidence
} from "./agentFeatureBacklog";
import { databaseConfigured, db } from "./db";
import { existingPublicTables } from "./operatorOpsRead";
import { creditsPerPack, signupCredits } from "./stripeBilling";
import type { OperatorModelPlan } from "./operatorClosure";

export type BusinessMetricsSnapshot = {
  captured_at: string;
  database_configured: boolean;
  auth_users: number | null;
  oauth_users: number | null;
  personal_profiles: number | null;
  interactions: number | null;
  personal_recommendations: number | null;
  credit_balance_total: number | null;
  lifetime_purchased: number | null;
  lifetime_spent: number | null;
  stripe_events: number | null;
  agent_runs_7d: number | null;
  agent_signals_queued: number | null;
  pending_approvals: number | null;
  compare_enabled: false;
  /** False = not LIVE unlimited coaching. Paid appearance Actions are separate. */
  appearance_agent_enabled: false;
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

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Heartbeat-safe snapshot: code/flag evidence only.
 * No table scans and no agent-schema DDL.
 */
export function snapshotBusinessFlags(): BusinessMetricsSnapshot {
  return {
    captured_at: new Date().toISOString(),
    database_configured: databaseConfigured(),
    auth_users: null,
    oauth_users: null,
    personal_profiles: null,
    interactions: null,
    personal_recommendations: null,
    credit_balance_total: null,
    lifetime_purchased: null,
    lifetime_spent: null,
    stripe_events: null,
    agent_runs_7d: null,
    agent_signals_queued: null,
    pending_approvals: null,
    compare_enabled: false,
    appearance_agent_enabled: false,
    credits_per_pack: creditsPerPack(),
    signup_credits: signupCredits(),
    amazon_tag: "ratemyfacegpt-20",
    commercial_loop:
      "free GPT acquisition → useful Action → account → persistent value → credits/payment → feedback/retention → experiment → improved Action → measured profit → bounded reinvestment",
    notes: [
      "Heartbeat snapshot is flag/code evidence only — table counts are not queried on this path.",
      "Heartbeat success is not feature progress. Only a verified implementation receipt advances the backlog."
    ]
  };
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
    personal_recommendations: null,
    credit_balance_total: null,
    lifetime_purchased: null,
    lifetime_spent: null,
    stripe_events: null,
    agent_runs_7d: null,
    agent_signals_queued: null,
    pending_approvals: null,
    compare_enabled: false,
    appearance_agent_enabled: false,
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

  const sql = db();
  let existing = new Set<string>();
  try {
    existing = await existingPublicTables(sql, [
      "rmf_personal_profiles",
      "rmf_interactions",
      "rmf_personal_recommendations",
      "rmf_credit_accounts",
      "rmf_stripe_events"
    ]);
  } catch {
    notes.push("information_schema table lookup failed");
  }

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

  if (existing.has("rmf_personal_profiles")) {
    const rows = await sql`select count(*)::int as total from rmf_personal_profiles`;
    base.personal_profiles = asNumber(rows[0]?.total);
  } else notes.push("rmf_personal_profiles missing");

  if (existing.has("rmf_interactions")) {
    const rows = await sql`select count(*)::int as total from rmf_interactions`;
    base.interactions = asNumber(rows[0]?.total);
  } else notes.push("rmf_interactions missing");

  if (existing.has("rmf_personal_recommendations")) {
    const rows = await sql`select count(*)::int as total from rmf_personal_recommendations`;
    base.personal_recommendations = asNumber(rows[0]?.total);
  } else notes.push("rmf_personal_recommendations missing");

  if (existing.has("rmf_credit_accounts")) {
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

  if (existing.has("rmf_stripe_events")) {
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
  notes.push("Account Learning pipeline writes rmf_interactions and derives rmf_personal_recommendations on paid Personal Network saves.");
  notes.push("Paid Compare Me To Me Action is credit-metered (OAuth + consent_compare + real image refs). Vision is limited; do not claim LIVE unlimited vision. Unauthenticated compare is not free.");
  notes.push("Paid Appearance Agent Actions are credit-metered (OAuth + consent_appearance + Account Learning + Compare history). Do not claim LIVE unlimited coaching. Unauthenticated appearance is not free.");
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

/** Persist latest + history strategy reports for dashboard visibility. No schema DDL. */
export async function writeStrategyReport(
  report: BusinessStrategyReport
): Promise<BusinessStrategyReport> {
  try {
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
  } catch {
    /* worker hot path must still return even if context persist fails */
  }
  return report;
}

export async function readStrategyReports(limit = 12): Promise<{
  latest: BusinessStrategyReport | null;
  history: BusinessStrategyReport[];
}> {
  if (!databaseConfigured()) return { latest: null, history: [] };
  try {
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
  } catch {
    return { latest: null, history: [] };
  }
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
    "Execution-bearing build cycle for Rate My Face.",
    "Inspect the Harry-specified backlog (Account Learning, Compare Me To Me, Appearance Agent, Social OAuth).",
    "Choose the highest-priority unfinished item from repo/production evidence — not another strategy report.",
    "If unfinished, dispatch the GitHub L2 implementation path (isolated branch, tests, draft PR). Do not merge unless the security envelope admits it.",
    "If evidence already looks complete, verify production health/flag/endpoint and record a receipt.",
    "Heartbeat enqueue, persist-heartbeat, and observe-only reports are not done.",
    "Do not invent ChatGPT chat counts, Amazon revenue, or Stripe USD. Label missing sources Unavailable.",
    "Compare Me To Me and Appearance Agent are paid credit-metered Actions (not LIVE unlimited vision/coaching claims). Unauthenticated compare/appearance are not free.",
    "Do not build extras. Product credits stay 1-credit for subscription features. Amazon/affiliate unchanged."
  ].join(" ");
}

const BACKLOG_STATE_KEY = "feature_backlog:state";
const BACKLOG_RECEIPTS_KEY = "feature_backlog:receipts";

export type FeatureBacklogConsole = {
  version: number;
  loop: "execution-bearing-v1";
  note: string;
  current_item: BacklogItemView | null;
  last_receipt: FeatureReceipt | null;
  blocked_on: BacklogItemView["blocked_on"];
  items: BacklogItemView[];
  feature_progress_from_counts: false;
};

export async function readFeatureReceipts(): Promise<FeatureReceipt[]> {
  if (!databaseConfigured()) return [];
  const sql = db();
  try {
    const rows = await sql`select value from rmf_agent_context where key = ${BACKLOG_RECEIPTS_KEY} limit 1`;
    return Array.isArray(rows[0]?.value) ? (rows[0].value as FeatureReceipt[]) : [];
  } catch {
    return [];
  }
}

export async function appendFeatureReceipt(receipt: FeatureReceipt): Promise<FeatureReceipt> {
  try {
    const sql = db();
    const existing = await readFeatureReceipts();
    const next = [receipt, ...existing.filter((r) => r.id !== receipt.id)].slice(0, 80);
    await sql`
      insert into rmf_agent_context(key, value, updated_at)
      values(${BACKLOG_RECEIPTS_KEY}, ${sql.json(next as any)}, now())
      on conflict(key) do update set value = excluded.value, updated_at = now()
    `;
  } catch {
    /* worker hot path must still return the in-memory receipt */
  }
  return receipt;
}

export async function writeFeatureBacklogState(state: FeatureBacklogConsole): Promise<FeatureBacklogConsole> {
  try {
    const sql = db();
    await sql`
      insert into rmf_agent_context(key, value, updated_at)
      values(${BACKLOG_STATE_KEY}, ${sql.json(state as any)}, now())
      on conflict(key) do update set value = excluded.value, updated_at = now()
    `;
  } catch {
    /* console persist is best-effort */
  }
  return state;
}

export function buildFeatureBacklogConsole(
  receipts: FeatureReceipt[],
  production: ProductionHealthEvidence | null = null
): FeatureBacklogConsole {
  const evidence = inspectRepoEvidence();
  const items = deriveBacklog(evidence, receipts, production);
  const current = selectHighestPriorityUnfinished(items);
  const last = receipts[0] || current?.last_receipt || null;
  return {
    version: loadFeatureBacklogSpec().version,
    loop: "execution-bearing-v1",
    note: "Run/signal/heartbeat counts are ops activity, not feature progress. Backlog advances only on a verified production receipt.",
    current_item: current,
    last_receipt: last,
    blocked_on: current?.blocked_on || null,
    items,
    feature_progress_from_counts: false
  };
}

export async function realizeFeatureBacklogConsole(
  production: ProductionHealthEvidence | null = null
): Promise<FeatureBacklogConsole> {
  const receipts = await readFeatureReceipts();
  const view = buildFeatureBacklogConsole(receipts, production);
  try {
    await writeFeatureBacklogState(view);
  } catch {
    // Console read should still succeed if persist fails.
  }
  return view;
}

export function cycleRecordFromDecision(
  decision: ManagerialDecision,
  extra: {
    executedTool?: string | null;
    closureState?: string | null;
    receiptVerified?: boolean;
    heartbeatOnly?: boolean;
  }
) {
  return classifyCycle({
    decision,
    executedTool: extra.executedTool as any,
    closureState: extra.closureState,
    receiptVerified: extra.receiptVerified,
    heartbeatOnly: extra.heartbeatOnly
  });
}

export function receiptFromTool(input: {
  itemId: FeatureReceipt["item_id"];
  kind: FeatureReceipt["kind"];
  verified: boolean;
  runId: number | null;
  signalId: number | null;
  externalRef: string | null;
  blockedOn: FeatureReceipt["blocked_on"];
  detail: Record<string, unknown>;
}): FeatureReceipt {
  return newFeatureReceipt({
    item_id: input.itemId,
    kind: input.kind,
    verified: input.verified,
    advances_backlog: input.kind === "production_verify" && input.verified,
    run_id: input.runId,
    signal_id: input.signalId,
    external_ref: input.externalRef,
    blocked_on: input.blockedOn,
    detail: input.detail
  });
}
