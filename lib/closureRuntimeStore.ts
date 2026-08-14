import { db, isUndefinedTableError } from "./db";
import { syncCodexMcpIdentity } from "./codexAgentIdentity";
import { existingPublicTables } from "./operatorOpsRead";
import {
  CONTROL_TABLES,
  readUnifiedControlPlane,
  unavailableUnifiedControlPlane,
  type UnifiedControlPlaneView,
  type UnifiedFeatureView
} from "./unifiedControlPlane";
import {
  funnelEvidenceFromMetrics,
  selectClosureRuntimeRound,
  type ClosureBuilderCandidate,
  type ClosureRuntimeRound
} from "./closureRuntime";

const CURSOR_KEY = "closure_runtime:cursor";
const LATEST_ROUND_KEY = "closure_runtime:latest_round";

function componentFor(feature: UnifiedFeatureView): ClosureBuilderCandidate["closure_component"] {
  if (feature.feature_key === "codex_agent_account" || feature.feature_key === "full_feature_access") return "identity";
  if (feature.category === "gpt_factory") return "gpt_factory";
  if (feature.feature_key === "feature_monitor_adder" || feature.category === "agent") return "monitor";
  if (feature.category === "money") return "money";
  return "features";
}

function funnelFor(feature: UnifiedFeatureView): ClosureBuilderCandidate["funnel_stage"] {
  if (feature.category === "gpt_factory") return "free_use";
  if (feature.category === "access") return "account";
  if (feature.category === "money") return "checkout";
  if (feature.category === "analytics" || feature.category === "agent") return "operations";
  return "paid_feature_success";
}

function metricFor(feature: UnifiedFeatureView): string {
  if (feature.category === "gpt_factory") return "free_use_to_account_activation";
  if (feature.category === "access") return "authorized_feature_acceptance";
  if (feature.category === "money") return "checkout_created_to_credit_grant";
  if (feature.category === "agent" || feature.category === "analytics") return "verified_receipts_per_changed_state";
  return "paid_feature_success";
}

function candidateFromFeature(feature: UnifiedFeatureView, browserConfigured: boolean): ClosureBuilderCandidate {
  const component = componentFor(feature);
  const isMoney = feature.category === "money";
  const isVerification = !isMoney && feature.lifecycle_status === "active" && feature.access_status === "available";
  const action = isVerification
    ? "verify"
    : feature.category === "gpt_factory"
      ? "non_protected_gpt_factory"
      : component === "identity"
        ? "browser_observe"
        : "code";
  const businessWeight = feature.category === "money" ? 5 : feature.category === "product" ? 5 : feature.category === "gpt_factory" ? 4 : 3;
  const requiresOwnerSession = action === "browser_observe" || action === "non_protected_gpt_factory";
  return {
    id: `registry-${feature.feature_key}`,
    title: isMoney
      ? `Build one non-financial activation or measurement improvement for ${feature.name}`
      : isVerification
      ? `Verify ${feature.name} through its closest user path`
      : `Close ${feature.name} with one bounded ${action === "code" ? "implementation" : "browser"} task`,
    closure_component: component,
    feature_key: feature.feature_key,
    action,
    authority: action === "verify" ? 0 : 2,
    exact_target: feature.endpoint || `control-feature:${feature.feature_key}`,
    acceptance: feature.acceptance.length
      ? feature.acceptance
      : ["Exact target produces the expected user-facing or control-plane result."],
    verification: action === "verify"
      ? ["Independently reread the live endpoint or user path and persist a receipt."]
      : ["Run targeted tests, independently verify the resulting user path, and persist a receipt."],
    rollback: `Revert or disable only the change for ${feature.feature_key}; keep the prior deployment recoverable.`,
    funnel_stage: funnelFor(feature),
    expected_metric: metricFor(feature),
    customer_value: businessWeight,
    revenue_potential: businessWeight,
    confidence: feature.evidence_status === "verified" ? 5 : feature.evidence_status === "partial" ? 3 : 2,
    urgency: Math.max(1, 6 - Math.min(feature.priority, 5)),
    time_to_ship: isVerification ? 1 : 2,
    estimated_agent_tokens: isVerification ? 1_000 : 6_000,
    operational_risk: action === "browser_observe" ? 2 : action === "verify" ? 1 : 2,
    financial_mutation: false,
    protected_asset: feature.feature_key === "rate_my_face",
    handwritten_content_write: false,
    requires_owner_session: requiresOwnerSession,
    dependency_blocked:
      (requiresOwnerSession && !browserConfigured) ||
      feature.feature_key === "affiliate_attribution"
  };
}

async function readPreviousCursor(sql: any, hasContext: boolean) {
  if (!hasContext) return null;
  const rows = await sql`select value from rmf_agent_context where key = ${CURSOR_KEY} limit 1`;
  return rows[0]?.value?.cursor ? String(rows[0].value.cursor) : null;
}

export async function computeClosureRuntimeRound(options: { persist?: boolean } = {}): Promise<ClosureRuntimeRound> {
  const sql = db();
  const existing = await existingPublicTables(sql, [...CONTROL_TABLES, "rmf_agent_context"]);
  if (options.persist && CONTROL_TABLES.every((table) => existing.has(table))) {
    await syncCodexMcpIdentity(sql);
  }
  const control = CONTROL_TABLES.every((table) => existing.has(table))
    ? await readUnifiedControlPlane(sql, existing)
    : unavailableUnifiedControlPlane("control_plane_schema_not_applied");
  const previousCursor = await readPreviousCursor(sql, existing.has("rmf_agent_context"));
  const browserConfigured = Boolean(process.env.RMF_BROWSER_CONTROL_URL && process.env.RMF_BROWSER_CONTROL_TOKEN);
  const round = selectClosureRuntimeRound({
    closure_input: {
      features: control.features,
      agents: control.agents,
      gpt_factory: control.gpt_factory,
      monetary_snapshots: control.monetary_snapshots
    },
    candidates: control.features.map((feature) => candidateFromFeature(feature, browserConfigured)),
    funnel: funnelEvidenceFromMetrics(control.monetary_snapshots),
    admitted_authority: Math.max(0, Math.min(6, Number(process.env.RMF_OPERATOR_MAX_AUTHORITY || 1))),
    previous_cursor: previousCursor
  });

  if (options.persist && existing.has("rmf_agent_context") && round.mode !== "idle_unchanged") {
    await sql`
      insert into rmf_agent_context(key, value, updated_at)
      values(${CURSOR_KEY}, ${sql.json({ cursor: round.cursor, updated_at: new Date().toISOString() })}, now())
      on conflict(key) do update set value = excluded.value, updated_at = now()
    `;
    await sql`
      insert into rmf_agent_context(key, value, updated_at)
      values(${LATEST_ROUND_KEY}, ${sql.json(round as any)}, now())
      on conflict(key) do update set value = excluded.value, updated_at = now()
    `;
  }
  return round;
}

export async function safeComputeClosureRuntimeRound(options: { persist?: boolean } = {}) {
  try {
    return await computeClosureRuntimeRound(options);
  } catch (error) {
    if (isUndefinedTableError(error)) return null;
    throw error;
  }
}
