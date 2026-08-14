import { createHash } from "node:crypto";
import {
  evaluateBusinessClosure,
  type BusinessClosure,
  type ClosureComponent,
  type ClosureInput
} from "./businessClosure.ts";

export type FunnelStage =
  | "free_use"
  | "account"
  | "paid_feature_intent"
  | "entitlement_check"
  | "checkout"
  | "payment"
  | "credit_grant"
  | "paid_feature_success"
  | "repeat_use"
  | "operations";

export type ReasoningLevel = "none" | "low" | "medium" | "high";
export type SpeedMode = "standard" | "fast";
export type BuilderAction = "verify" | "code" | "browser_observe" | "non_protected_gpt_factory" | "external_financial";

export type ClosureBuilderCandidate = {
  id: string;
  title: string;
  closure_component: ClosureComponent["key"];
  feature_key: string | null;
  action: BuilderAction;
  authority: number;
  exact_target: string;
  acceptance: string[];
  verification: string[];
  rollback: string;
  funnel_stage: FunnelStage;
  expected_metric: string;
  customer_value: number;
  revenue_potential: number;
  confidence: number;
  urgency: number;
  time_to_ship: number;
  estimated_agent_tokens: number;
  operational_risk: number;
  financial_mutation: boolean;
  protected_asset: boolean;
  handwritten_content_write: boolean;
  requires_owner_session?: boolean;
  dependency_blocked?: boolean;
  feature_evidence_verified?: boolean;
  time_critical?: boolean;
};

export type FunnelEvidence = Partial<Record<FunnelStage, number | null>>;

export type FunnelMetric = {
  source: string;
  metric_key: string;
  numeric_value: string | null;
};

export type ClosureRuntimeInput = {
  closure_input: ClosureInput;
  candidates: ClosureBuilderCandidate[];
  funnel: FunnelEvidence;
  admitted_authority: number;
  previous_cursor?: string | null;
  active_task_id?: string | null;
};

export type BuilderTaskCapsule = {
  id: string;
  objective: string;
  closure_component: ClosureComponent["key"];
  feature_key: string | null;
  exact_target: string;
  acceptance: string[];
  verification: string[];
  rollback: string;
  expected_metric: string;
  funnel_stage: FunnelStage;
  reasoning: ReasoningLevel;
  speed: SpeedMode;
  estimated_agent_tokens: number;
  authority: number;
  stop_condition: string;
  financial_actions_allowed: false;
  protected_instruction_writes_allowed: false;
};

export type CandidateEvaluation = {
  candidate: ClosureBuilderCandidate;
  score: number;
  admitted: boolean;
  reasons: string[];
};

export type ClosureRuntimeRound = {
  runtime: "business-closure-selector-v1";
  cursor: string;
  closure: BusinessClosure;
  funnel_frontier: FunnelStage | null;
  mode: "idle_unchanged" | "continue_active_task" | "build" | "blocked" | "external_financial";
  reasoning: ReasoningLevel;
  speed: SpeedMode;
  selected: BuilderTaskCapsule | null;
  evaluations: CandidateEvaluation[];
  reason: string;
};

const FUNNEL_STAGES: FunnelStage[] = [
  "free_use",
  "account",
  "paid_feature_intent",
  "entitlement_check",
  "checkout",
  "payment",
  "credit_grant",
  "paid_feature_success",
  "repeat_use"
];

function funnelMetricNumber(metrics: FunnelMetric[], source: string, metricKey: string): number | null {
  const raw = metrics.find((metric) => metric.source === source && metric.metric_key === metricKey)?.numeric_value;
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Maps only like-for-like evidence; bootstrap credit use is not paid use. */
export function funnelEvidenceFromMetrics(metrics: FunnelMetric[]): FunnelEvidence {
  return {
    free_use: funnelMetricNumber(metrics, "openai", "rate_my_face.chat_count_lower_bound"),
    account: funnelMetricNumber(metrics, "supabase", "oauth.users"),
    credit_grant: funnelMetricNumber(metrics, "product", "credits.lifetime_purchased"),
    paid_feature_success: funnelMetricNumber(metrics, "product", "paid_feature.successes")
  };
}

function stableCursor(input: ClosureRuntimeInput, closure: BusinessClosure) {
  const stable = {
    closure: closure.components.map((item) => ({ key: item.key, state: item.state })),
    funnel: Object.fromEntries(FUNNEL_STAGES.map((stage) => [stage, input.funnel[stage] ?? null])),
    authority: input.admitted_authority,
    candidates: input.candidates.map((candidate) => ({
      id: candidate.id,
      action: candidate.action,
      component: candidate.closure_component,
      target: candidate.exact_target,
      scores: [candidate.customer_value, candidate.revenue_potential, candidate.confidence, candidate.urgency],
      constraints: [
        candidate.financial_mutation,
        candidate.protected_asset,
        candidate.handwritten_content_write,
        candidate.dependency_blocked,
        candidate.feature_evidence_verified
      ]
    }))
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

/** First measurable funnel drop-off. Unknown data does not manufacture a bottleneck. */
export function firstFunnelFrontier(funnel: FunnelEvidence): FunnelStage | null {
  for (let index = 1; index < FUNNEL_STAGES.length; index += 1) {
    const prior = funnel[FUNNEL_STAGES[index - 1]];
    const current = funnel[FUNNEL_STAGES[index]];
    if (prior == null || current == null || prior <= 0) continue;
    if (current === 0 || current / prior < 0.5) return FUNNEL_STAGES[index];
  }
  return null;
}

function validTaskShape(candidate: ClosureBuilderCandidate) {
  return Boolean(
    candidate.exact_target.trim() &&
      candidate.acceptance.length &&
      candidate.verification.length &&
      candidate.rollback.trim() &&
      candidate.expected_metric.trim()
  );
}

function componentState(closure: BusinessClosure, key: ClosureComponent["key"]) {
  return closure.components.find((component) => component.key === key)?.state || "unresolved";
}

function score(candidate: ClosureBuilderCandidate) {
  const denominator = Math.max(1, candidate.time_to_ship) *
    Math.max(0.5, candidate.estimated_agent_tokens / 8_000) *
    Math.max(1, candidate.operational_risk);
  return Number(((candidate.customer_value * candidate.revenue_potential * candidate.confidence * candidate.urgency) / denominator).toFixed(4));
}

function reasoningFor(candidate: ClosureBuilderCandidate): ReasoningLevel {
  if (candidate.action === "verify" || candidate.action === "browser_observe") return "low";
  if (candidate.operational_risk >= 4 || candidate.confidence <= 2) return "high";
  return "medium";
}

function toTask(candidate: ClosureBuilderCandidate): BuilderTaskCapsule {
  return {
    id: `closure:${candidate.id}`,
    objective: candidate.title,
    closure_component: candidate.closure_component,
    feature_key: candidate.feature_key,
    exact_target: candidate.exact_target,
    acceptance: candidate.acceptance,
    verification: candidate.verification,
    rollback: candidate.rollback,
    expected_metric: candidate.expected_metric,
    funnel_stage: candidate.funnel_stage,
    reasoning: reasoningFor(candidate),
    speed: candidate.time_critical ? "fast" : "standard",
    estimated_agent_tokens: candidate.estimated_agent_tokens,
    authority: candidate.authority,
    stop_condition: "Produce one independently verified receipt, then recompute closure before selecting another task.",
    financial_actions_allowed: false,
    protected_instruction_writes_allowed: false
  };
}

/**
 * Deterministic admission gate for the builder. It deliberately never turns an
 * observed money gap into permission to transact, and never admits protected or
 * handwritten content as a target.
 */
export function selectClosureRuntimeRound(input: ClosureRuntimeInput): ClosureRuntimeRound {
  const closure = evaluateBusinessClosure(input.closure_input);
  const cursor = stableCursor(input, closure);
  const protectedState = componentState(closure, "protected");
  const funnelFrontier = firstFunnelFrontier(input.funnel);

  if (protectedState === "unresolved") {
    return {
      runtime: "business-closure-selector-v1", cursor, closure, funnel_frontier: funnelFrontier,
      mode: "blocked", reasoning: "none", speed: "standard", selected: null, evaluations: [],
      reason: "Protected-instruction invariant is unresolved; no builder task is admissible."
    };
  }
  if (input.active_task_id) {
    return {
      runtime: "business-closure-selector-v1", cursor, closure, funnel_frontier: funnelFrontier,
      mode: "continue_active_task", reasoning: "none", speed: "standard", selected: null, evaluations: [],
      reason: `Continue active task ${input.active_task_id}; do not spend tokens selecting duplicate work.`
    };
  }
  if (input.previous_cursor && input.previous_cursor === cursor) {
    return {
      runtime: "business-closure-selector-v1", cursor, closure, funnel_frontier: funnelFrontier,
      mode: "idle_unchanged", reasoning: "none", speed: "standard", selected: null, evaluations: [],
      reason: "No material closure, funnel, authority, or candidate delta; monitoring stops without a reasoning-model call."
    };
  }

  const evaluations = input.candidates.map((candidate): CandidateEvaluation => {
    const reasons: string[] = [];
    const candidateComponentState = componentState(closure, candidate.closure_component);
    if (!validTaskShape(candidate)) reasons.push("task_capsule_incomplete");
    if (candidate.authority > input.admitted_authority) reasons.push("authority_not_admitted");
    if (candidate.financial_mutation || candidate.action === "external_financial") reasons.push("financial_action_not_admitted");
    if (candidate.protected_asset || candidate.handwritten_content_write) reasons.push("protected_or_handwritten_target_forbidden");
    if (candidate.dependency_blocked) reasons.push("dependency_unresolved");
    if (candidate.feature_evidence_verified) reasons.push("feature_evidence_already_verified");
    if (candidateComponentState === "closed" || candidateComponentState === "protected") reasons.push("closure_component_already_closed");
    if (
      funnelFrontier &&
      candidate.funnel_stage !== "operations" &&
      FUNNEL_STAGES.indexOf(candidate.funnel_stage) > FUNNEL_STAGES.indexOf(funnelFrontier)
    ) reasons.push("later_than_first_measured_funnel_dropoff");
    return { candidate, score: score(candidate), admitted: reasons.length === 0, reasons };
  });

  const selectedEvaluation = evaluations
    .filter((evaluation) => evaluation.admitted)
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id))[0];
  if (selectedEvaluation) {
    const selected = toTask(selectedEvaluation.candidate);
    return {
      runtime: "business-closure-selector-v1", cursor, closure, funnel_frontier: funnelFrontier,
      mode: "build", reasoning: selected.reasoning, speed: selected.speed, selected, evaluations,
      reason: "Selected the highest value-per-token admissible task for an unresolved closure component."
    };
  }

  const onlyMoney = closure.unresolved.length === 1 && closure.unresolved[0]?.key === "money";
  return {
    runtime: "business-closure-selector-v1", cursor, closure, funnel_frontier: funnelFrontier,
    mode: onlyMoney ? "external_financial" : "blocked", reasoning: "none", speed: "standard", selected: null, evaluations,
    reason: onlyMoney
      ? "Only the external financial frontier remains; observe provider receipts but do not transact."
      : "No candidate meets the closure admission relation; resolve the listed blocking evidence before reasoning again."
  };
}
