/**
 * Execution-bearing managerial loop for Harry-specified product features.
 *
 * Heartbeats supervise this state machine. They do not ship features.
 * Backlog status is derived from repo/production evidence, not run counts.
 * The backlog advances only when a verified production receipt is recorded.
 */

import type { Authority, OperatorToolName } from "./operatorTools";
import type { OperatorCandidate, OperatorModelPlan } from "./operatorClosure";

export const FEATURE_BACKLOG_VERSION = 1;
export const MANAGERIAL_LOOP = "execution-bearing-v1";

export const FEATURE_IDS = [
  "account_learning",
  "compare_me_to_me",
  "appearance_agent",
  "social_oauth"
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export type BacklogBlockedOn =
  | "approval"
  | "missing_secret"
  | "tests"
  | "production_unreachable"
  | null;

export type BacklogLoopStatus =
  | "shipped"
  | "pending_verification"
  | "unfinished"
  | "in_flight"
  | "blocked";

export type CycleOutcomeKind =
  | "idle_no_unfinished"
  | "blocked"
  | "dispatch_attempted"
  | "verified_receipt"
  | "noop_failed";

export type ManagerialActionKind = "idle" | "verify" | "dispatch" | "blocked";

export type FeatureReceiptKind = "implementation_dispatch" | "production_verify" | "heartbeat";

export type FeatureReceipt = {
  id: string;
  item_id: FeatureId | null;
  kind: FeatureReceiptKind;
  verified: boolean;
  advances_backlog: boolean;
  created_at: string;
  run_id: number | null;
  signal_id: number | null;
  external_ref: string | null;
  blocked_on: BacklogBlockedOn;
  detail: Record<string, unknown>;
};

export type FeatureBacklogSpecItem = {
  id: FeatureId;
  title: string;
  priority: number;
  acceptance: string[];
  evidence: {
    openapi_operations: string[];
    health_enabled_path: string;
    health_enabled_equals?: string;
    tables: string[];
    endpoint: string;
    flag_module?: string;
    requires_secret?: boolean;
  };
};

export type FeatureBacklogFile = {
  version: number;
  updated: string;
  note: string;
  items: FeatureBacklogSpecItem[];
};

export type RepoEvidence = {
  inspected_at: string;
  openapi_operations: string[];
  flags: {
    account_learning: boolean;
    compare_me_to_me: boolean;
    appearance_agent: boolean;
    social_oauth: boolean;
  };
  social_credentials_configured: boolean;
  github_write_configured: boolean;
  production_url: string | null;
  max_authority: number;
};

export type ProductionHealthEvidence = {
  reachable: boolean;
  status: number | null;
  target: string | null;
  account_learning_retrieve_action: string | null;
  compare_enabled: boolean | null;
  appearance_enabled: boolean | null;
  social_enabled: boolean | null;
};

export type BacklogItemView = {
  id: FeatureId;
  title: string;
  priority: number;
  acceptance: string[];
  evidence_complete: boolean;
  loop_status: BacklogLoopStatus;
  blocked_on: BacklogBlockedOn;
  last_receipt: FeatureReceipt | null;
  evidence: {
    flag_enabled: boolean;
    openapi_present: boolean;
    health_matches: boolean | null;
    endpoint: string;
  };
};

export type ManagerialDecision = {
  loop: typeof MANAGERIAL_LOOP;
  action: ManagerialActionKind;
  outcome_if_supervised_only: CycleOutcomeKind;
  selected_item: BacklogItemView | null;
  blocked_on: BacklogBlockedOn;
  required_authority: Authority;
  feature_progress: false;
  reason: string;
  candidate: OperatorCandidate | null;
};

export const KNOWN_OPENAPI_OPERATIONS = [
  "searchProduct",
  "getEntitlements",
  "createCreditCheckoutSession",
  "getPersonalNetwork",
  "updatePersonalNetwork",
  "getUserContext",
  "saveUserContext",
  "deleteUserContext",
  "compareMeToMe"
] as const;

/** Canonical spec (keep in sync with operator/FEATURE_BACKLOG.json). */
export const FEATURE_BACKLOG_SPEC: FeatureBacklogFile = {
  version: FEATURE_BACKLOG_VERSION,
  updated: "2026-08-13",
  note: "Harry-specified Rate My Face product features only. Status is derived from repo/production evidence (flags, OpenAPI, health, tables), not heartbeat or run counts. Heartbeats supervise; they do not ship features.",
  items: [
    {
      id: "account_learning",
      title: "Account Learning",
      priority: 1,
      acceptance: [
        "OpenAPI getPersonalNetwork and updatePersonalNetwork are present",
        "Health account_learning.retrieve_action is getPersonalNetwork",
        "Paid Personal Network writes persist rmf_interactions and derive rmf_personal_recommendations",
        "Product credits stay 1-credit (PERSONAL_ACTION_COST); no parallel billing path"
      ],
      evidence: {
        openapi_operations: ["getPersonalNetwork", "updatePersonalNetwork"],
        health_enabled_path: "account_learning.retrieve_action",
        health_enabled_equals: "getPersonalNetwork",
        tables: ["rmf_personal_profiles", "rmf_interactions", "rmf_personal_recommendations"],
        endpoint: "/api/personal"
      }
    },
    {
      id: "compare_me_to_me",
      title: "Compare Me To Me",
      priority: 2,
      acceptance: [
        "Paid OpenAPI compareMeToMe Action is enabled",
        "Health compare_me_to_me.enabled is true",
        "POST /api/compare meters 1 credit with consent_compare and real image refs",
        "Unauthenticated compare is not free; job listing stays non-public"
      ],
      evidence: {
        flag_module: "COMPARE_ME_TO_ME.enabled",
        openapi_operations: ["compareMeToMe"],
        health_enabled_path: "compare_me_to_me.enabled",
        tables: ["rmf_compare_jobs", "rmf_compare_results"],
        endpoint: "/api/compare"
      }
    },
    {
      id: "appearance_agent",
      title: "Appearance Agent",
      priority: 3,
      acceptance: [
        "APPEARANCE_AGENT.enabled is true only after Account Learning + Compare gates",
        "Health appearance_agent.enabled is true",
        "OpenAPI Action exists when enabled; until then stubs stay disabled / not LIVE coaching",
        "Future paid ops use the same 1-credit unit"
      ],
      evidence: {
        flag_module: "APPEARANCE_AGENT.enabled",
        openapi_operations: [],
        health_enabled_path: "appearance_agent.enabled",
        tables: ["rmf_appearance_plans", "rmf_appearance_checkins"],
        endpoint: "/api/appearance"
      }
    },
    {
      id: "social_oauth",
      title: "Social OAuth",
      priority: 4,
      acceptance: [
        "User-authorized Instagram / LinkedIn / TikTok OAuth only — no scraping",
        "Health social_providers.enabled is true only when provider secrets exist",
        "Connect/disconnect persist encrypted token_ref, never raw tokens",
        "Do not invent extra social products"
      ],
      evidence: {
        flag_module: "SOCIAL_PROVIDER_OAUTH.enabled",
        openapi_operations: [],
        health_enabled_path: "social_providers.enabled",
        tables: ["rmf_provider_connections"],
        endpoint: "/api/providers",
        requires_secret: true
      }
    }
  ]
};

export function loadFeatureBacklogSpec(): FeatureBacklogFile {
  return FEATURE_BACKLOG_SPEC;
}

export function inspectRepoEvidence(overrides: Partial<RepoEvidence> = {}): RepoEvidence {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || null;
  const production_url = host ? `https://${String(host).replace(/^https?:\/\//, "")}` : null;
  const flags = {
    // Keep aligned with COMPARE_ME_TO_ME / APPEARANCE_AGENT / SOCIAL_PROVIDER_OAUTH.
    account_learning: true,
    compare_me_to_me: true,
    appearance_agent: false,
    social_oauth: false,
    ...(overrides.flags || {})
  };
  return {
    inspected_at: overrides.inspected_at || new Date().toISOString(),
    openapi_operations: overrides.openapi_operations || [...KNOWN_OPENAPI_OPERATIONS],
    flags,
    social_credentials_configured: overrides.social_credentials_configured ?? false,
    github_write_configured: overrides.github_write_configured ?? Boolean(process.env.GITHUB_OPERATOR_TOKEN),
    production_url: overrides.production_url === undefined ? production_url : overrides.production_url,
    max_authority: overrides.max_authority ?? Number(process.env.RMF_OPERATOR_MAX_AUTHORITY || 1)
  };
}

function readHealthPath(health: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!health) return undefined;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, health);
}

export function productionHealthFromJson(
  health: Record<string, unknown> | null | undefined,
  meta: { reachable: boolean; status: number | null; target: string | null }
): ProductionHealthEvidence {
  return {
    reachable: meta.reachable,
    status: meta.status,
    target: meta.target,
    account_learning_retrieve_action:
      readHealthPath(health, "account_learning.retrieve_action") != null
        ? String(readHealthPath(health, "account_learning.retrieve_action"))
        : null,
    compare_enabled:
      typeof readHealthPath(health, "compare_me_to_me.enabled") === "boolean"
        ? Boolean(readHealthPath(health, "compare_me_to_me.enabled"))
        : null,
    appearance_enabled:
      typeof readHealthPath(health, "appearance_agent.enabled") === "boolean"
        ? Boolean(readHealthPath(health, "appearance_agent.enabled"))
        : null,
    social_enabled:
      typeof readHealthPath(health, "social_providers.enabled") === "boolean"
        ? Boolean(readHealthPath(health, "social_providers.enabled"))
        : null
  };
}

function flagEnabled(id: FeatureId, evidence: RepoEvidence): boolean {
  return Boolean(evidence.flags[id]);
}

function openapiPresent(item: FeatureBacklogSpecItem, evidence: RepoEvidence): boolean {
  if (!item.evidence.openapi_operations.length) return false;
  return item.evidence.openapi_operations.every((op) => evidence.openapi_operations.includes(op));
}

function healthMatches(
  item: FeatureBacklogSpecItem,
  production: ProductionHealthEvidence | null
): boolean | null {
  if (!production?.reachable) return null;
  if (item.id === "account_learning") {
    const expected = item.evidence.health_enabled_equals || "getPersonalNetwork";
    return production.account_learning_retrieve_action === expected;
  }
  if (item.id === "compare_me_to_me") return production.compare_enabled === true;
  if (item.id === "appearance_agent") return production.appearance_enabled === true;
  if (item.id === "social_oauth") return production.social_enabled === true;
  return null;
}

export function evidenceComplete(
  item: FeatureBacklogSpecItem,
  evidence: RepoEvidence,
  production: ProductionHealthEvidence | null = null
): boolean {
  const flag = flagEnabled(item.id, evidence);
  const ops = item.evidence.openapi_operations.length ? openapiPresent(item, evidence) : flag;
  if (item.id === "account_learning") return flag && ops;
  if (item.id === "compare_me_to_me") return flag && ops;
  if (item.id === "appearance_agent") return flag;
  if (item.id === "social_oauth") return flag && evidence.social_credentials_configured;
  return flag && ops;
}

function latestReceiptFor(itemId: FeatureId, receipts: FeatureReceipt[]): FeatureReceipt | null {
  return receipts.find((r) => r.item_id === itemId) || null;
}

function hasVerifiedShipReceipt(itemId: FeatureId, receipts: FeatureReceipt[]): boolean {
  return receipts.some((r) => r.item_id === itemId && r.kind === "production_verify" && r.verified && r.advances_backlog);
}

function hasOpenDispatch(itemId: FeatureId, receipts: FeatureReceipt[]): boolean {
  const latest = latestReceiptFor(itemId, receipts);
  return Boolean(latest && latest.kind === "implementation_dispatch" && !hasVerifiedShipReceipt(itemId, receipts));
}

export function deriveBacklogItem(
  item: FeatureBacklogSpecItem,
  evidence: RepoEvidence,
  receipts: FeatureReceipt[],
  production: ProductionHealthEvidence | null = null
): BacklogItemView {
  const complete = evidenceComplete(item, evidence, production);
  const shipped = hasVerifiedShipReceipt(item.id, receipts);
  const last = latestReceiptFor(item.id, receipts);
  const health = healthMatches(item, production);
  let blocked_on: BacklogBlockedOn = null;
  if (!shipped && item.evidence.requires_secret && !evidence.social_credentials_configured) {
    blocked_on = "missing_secret";
  }
  if (last?.blocked_on && !shipped) blocked_on = last.blocked_on;

  let loop_status: BacklogLoopStatus;
  if (shipped) loop_status = "shipped";
  else if (blocked_on) loop_status = "blocked";
  else if (hasOpenDispatch(item.id, receipts)) loop_status = "in_flight";
  else if (complete) loop_status = "pending_verification";
  else loop_status = "unfinished";

  return {
    id: item.id,
    title: item.title,
    priority: item.priority,
    acceptance: item.acceptance,
    evidence_complete: complete,
    loop_status,
    blocked_on,
    last_receipt: last,
    evidence: {
      flag_enabled: flagEnabled(item.id, evidence),
      openapi_present: openapiPresent(item, evidence),
      health_matches: health,
      endpoint: item.evidence.endpoint
    }
  };
}

export function deriveBacklog(
  evidence: RepoEvidence,
  receipts: FeatureReceipt[],
  production: ProductionHealthEvidence | null = null,
  spec: FeatureBacklogFile = loadFeatureBacklogSpec()
): BacklogItemView[] {
  return [...spec.items]
    .sort((a, b) => a.priority - b.priority)
    .map((item) => deriveBacklogItem(item, evidence, receipts, production));
}

export function selectHighestPriorityUnfinished(items: BacklogItemView[]): BacklogItemView | null {
  return items.find((item) => item.loop_status !== "shipped") || null;
}

export function isFeatureProgress(kind: CycleOutcomeKind | FeatureReceiptKind | string): boolean {
  return kind === "verified_receipt";
}

export function heartbeatIsNotFeatureProgress(): false {
  return false;
}

function dispatchCandidate(item: BacklogItemView): OperatorCandidate {
  return {
    id: `dispatch-${item.id}`,
    tool: "github_implementation_dispatch",
    authority: 2,
    intent: `Dispatch an isolated-branch implementation path for ${item.title}.`,
    reason: "Unfinished Harry-specified feature — heartbeat/strategy reports are not done.",
    expected_return: "Isolated branch + dispatch artifact readback; optional draft PR; no merge.",
    reversible: true,
    invariants: [
      "do_not_modify_base_branch",
      "do_not_merge",
      "independent_readback_must_match_expected_digest",
      "halt_after_one_mutation",
      "do_not_count_heartbeat_as_progress"
    ],
    args: { feature_id: item.id, title: item.title, acceptance: item.acceptance }
  };
}

function verifyCandidate(item: BacklogItemView): OperatorCandidate {
  return {
    id: `verify-${item.id}`,
    tool: "feature_production_verify",
    authority: 0,
    intent: `Verify ${item.title} against production health / feature flag / endpoint.`,
    reason: "Repo evidence looks complete; backlog advances only on a verified production receipt.",
    expected_return: "Production health (or equivalent live endpoint) matches acceptance evidence.",
    reversible: true,
    invariants: [
      "do_not_advance_without_verified_receipt",
      "repo_flags_alone_do_not_ship",
      "heartbeat_is_not_verification"
    ],
    args: { feature_id: item.id }
  };
}

export function decideManagerialAction(input: {
  evidence: RepoEvidence;
  receipts: FeatureReceipt[];
  production?: ProductionHealthEvidence | null;
  admittedAuthority: Authority;
  spec?: FeatureBacklogFile;
}): ManagerialDecision {
  const items = deriveBacklog(input.evidence, input.receipts, input.production || null, input.spec);
  const selected = selectHighestPriorityUnfinished(items);
  const base: Pick<ManagerialDecision, "loop" | "selected_item" | "feature_progress"> = {
    loop: MANAGERIAL_LOOP,
    selected_item: selected,
    feature_progress: false
  };

  if (!selected) {
    return {
      ...base,
      action: "idle",
      outcome_if_supervised_only: "idle_no_unfinished",
      blocked_on: null,
      required_authority: 0,
      reason: "No unfinished Harry-specified backlog item.",
      candidate: null
    };
  }

  if (selected.loop_status === "in_flight") {
    return {
      ...base,
      action: "blocked",
      outcome_if_supervised_only: "blocked",
      blocked_on: "tests",
      required_authority: 0,
      reason: "Implementation dispatch is already in flight — waiting for tests/merge before production verify. Not a successful observe cycle.",
      candidate: null
    };
  }

  if (selected.loop_status === "blocked" || selected.blocked_on) {
    return {
      ...base,
      action: "blocked",
      outcome_if_supervised_only: "blocked",
      blocked_on: selected.blocked_on,
      required_authority: selected.blocked_on === "approval" ? 2 : 0,
      reason: `Blocked on ${selected.blocked_on || "unknown"} — not a successful observe cycle.`,
      candidate: null
    };
  }

  if (selected.loop_status === "pending_verification" || selected.evidence_complete) {
    if (!input.evidence.production_url && !input.production?.reachable) {
      return {
        ...base,
        action: "blocked",
        outcome_if_supervised_only: "blocked",
        blocked_on: "production_unreachable",
        required_authority: 0,
        reason: "Evidence looks complete but production health/endpoint is not reachable — cannot record a ship receipt.",
        candidate: null
      };
    }
    return {
      ...base,
      action: "verify",
      outcome_if_supervised_only: "noop_failed",
      blocked_on: null,
      required_authority: 0,
      reason: `Verify ${selected.title} in production before advancing the backlog.`,
      candidate: verifyCandidate(selected)
    };
  }

  if (!input.evidence.github_write_configured) {
    return {
      ...base,
      action: "blocked",
      outcome_if_supervised_only: "blocked",
      blocked_on: "missing_secret",
      required_authority: 2,
      reason: "GITHUB_OPERATOR_TOKEN is not configured — cannot dispatch an isolated branch/PR.",
      candidate: null
    };
  }

  if (input.admittedAuthority < 2) {
    return {
      ...base,
      action: "blocked",
      outcome_if_supervised_only: "blocked",
      blocked_on: "approval",
      required_authority: 2,
      reason: "Implementation dispatch is L2 (isolated branch/PR). Security envelope has not admitted L2 — do not bypass approvals.",
      candidate: dispatchCandidate(selected)
    };
  }

  return {
    ...base,
    action: "dispatch",
    outcome_if_supervised_only: "noop_failed",
    blocked_on: null,
    required_authority: 2,
    reason: `Dispatch implementation path for unfinished feature ${selected.title}.`,
    candidate: dispatchCandidate(selected)
  };
}

const OBSERVE_ONLY_TOOLS = new Set<OperatorToolName>([
  "project_context_read",
  "github_read",
  "vercel_observe",
  "browser_observe"
]);

export function classifyCycle(input: {
  decision: ManagerialDecision;
  executedTool?: OperatorToolName | null;
  closureState?: string | null;
  receiptVerified?: boolean;
  heartbeatOnly?: boolean;
}): { outcome: CycleOutcomeKind; feature_progress: boolean; blocked_on: BacklogBlockedOn } {
  if (input.heartbeatOnly) {
    return { outcome: "noop_failed", feature_progress: false, blocked_on: null };
  }

  const { decision } = input;
  if (decision.action === "idle") {
    return { outcome: "idle_no_unfinished", feature_progress: false, blocked_on: null };
  }
  if (decision.action === "blocked" || input.closureState === "awaiting_approval") {
    return {
      outcome: "blocked",
      feature_progress: false,
      blocked_on: decision.blocked_on || (input.closureState === "awaiting_approval" ? "approval" : null)
    };
  }

  if (input.executedTool === "feature_production_verify" && input.receiptVerified) {
    return { outcome: "verified_receipt", feature_progress: true, blocked_on: null };
  }
  if (input.executedTool === "github_implementation_dispatch") {
    return { outcome: "dispatch_attempted", feature_progress: false, blocked_on: null };
  }

  if (!input.executedTool || OBSERVE_ONLY_TOOLS.has(input.executedTool)) {
    return { outcome: "noop_failed", feature_progress: false, blocked_on: decision.blocked_on };
  }

  return { outcome: "noop_failed", feature_progress: false, blocked_on: decision.blocked_on };
}

export function managerialPlan(decision: ManagerialDecision): OperatorModelPlan {
  const item = decision.selected_item;
  const observations = [
    `Managerial loop ${MANAGERIAL_LOOP}: ${decision.action}.`,
    decision.reason,
    item
      ? `Selected ${item.title} (${item.id}) · loop_status=${item.loop_status} · evidence_complete=${item.evidence_complete}`
      : "Backlog has no unfinished item.",
    "Heartbeat / strategy markdown / signal enqueue is not feature progress."
  ];
  return {
    summary: item
      ? `Execution-bearing cycle: ${decision.action} ${item.title}. ${decision.reason}`
      : `Execution-bearing cycle: ${decision.action}. ${decision.reason}`,
    observations,
    candidates: decision.candidate ? [decision.candidate] : [],
    required_authority: decision.required_authority,
    requires_human_approval: decision.blocked_on === "approval",
    verification: item?.acceptance || ["Record an honest idle or blocked outcome; do not invent feature progress."],
    business_impact: {
      bottleneck: item ? `unfinished_feature:${item.id}` : "none",
      hypothesis: "Shipping the next specified feature requires a GitHub dispatch or a verified production receipt.",
      recommended_next_step:
        decision.action === "idle"
          ? "No unfinished backlog item — do not write another strategy report."
          : decision.action === "blocked"
            ? `Unblock ${decision.blocked_on || "unknown"} before claiming progress.`
            : decision.action === "verify"
              ? `Verify ${item?.title} via health/flag/endpoint and record a receipt.`
              : `Dispatch isolated branch/PR for ${item?.title}.`,
      expected_metric_effect:
        decision.action === "verify"
          ? "Backlog advances only if production verification matches acceptance."
          : "No feature is shipped until a verified production receipt exists.",
      funnel_stage: "build_loop",
      confidence: "high"
    }
  };
}

export function verifyFeatureAgainstHealth(
  item: FeatureBacklogSpecItem,
  production: ProductionHealthEvidence
): { verified: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!production.reachable) {
    reasons.push("production_health_unreachable");
    return { verified: false, reasons };
  }
  const match = healthMatches(item, production);
  if (match !== true) {
    reasons.push(`health_mismatch:${item.evidence.health_enabled_path}`);
    return { verified: false, reasons };
  }
  reasons.push("production_health_matches_acceptance");
  return { verified: true, reasons };
}

export function heartbeatIdempotencyKey(at: Date = new Date()): string {
  const day = at.toISOString().slice(0, 10);
  return `heartbeat:business_improve:${day}`;
}

export function newFeatureReceipt(input: Omit<FeatureReceipt, "id" | "created_at"> & { id?: string; created_at?: string }): FeatureReceipt {
  return {
    id: input.id || `fcr_${input.run_id || "x"}_${Date.now()}`,
    created_at: input.created_at || new Date().toISOString(),
    item_id: input.item_id,
    kind: input.kind,
    verified: input.verified,
    advances_backlog: Boolean(input.advances_backlog && input.verified && input.kind === "production_verify"),
    run_id: input.run_id,
    signal_id: input.signal_id,
    external_ref: input.external_ref,
    blocked_on: input.blocked_on,
    detail: input.detail
  };
}
