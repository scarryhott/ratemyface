export const PERSONAL_INTELLIGENCE_ACTION_COST = 1;
export const PRODUCT_OUTCOME_MINIMUM = 2;
export const REFERENCE_MINIMUM_PAIRS = 2;
export const SOCIAL_MINIMUM_OBSERVATIONS = 4;
export const EVIDENCE_TIE_MARGIN = 0.25;

export const PERSONAL_INTELLIGENCE = {
  enabled: true as const,
  status: "paid" as const,
  dashboard_status: "READY" as const,
  action_paths: {
    ask_history: "/api/history/ask",
    product_outcomes: "/api/products/outcomes",
    social_outcomes: "/api/social/outcomes",
    references: "/api/references",
    personal_agent: "/api/personal-agent",
    mcp: "/api/mcp"
  } as const,
  tables: [
    "rmf_product_outcomes",
    "rmf_social_outcomes",
    "rmf_reference_comparisons",
    "rmf_reference_observations",
    "rmf_personal_agent_runs",
    "rmf_personal_agent_actions",
    "rmf_personal_agent_receipts"
  ] as const,
  note:
    "Paid personal-intelligence Actions (OAuth + 1 credit). Conclusions close only after minimum evidence; insufficient and tied states stay explicit. Social data is user-recorded or provider-authorized, never scraped. The personal agent may read autonomously but stores or external actions remain approval-gated with receipts."
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; message: string };

export function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  return values.length ? rounded(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function observedAt(value: unknown): ValidationResult<string | null> {
  const raw = boundedText(value, 80);
  if (raw && !Number.isFinite(Date.parse(raw))) {
    return { ok: false, error: "invalid_observed_at", message: "observed_at must be an ISO-8601 timestamp." };
  }
  return { ok: true, value: raw ? new Date(raw).toISOString() : null };
}

export function validateHistoryQuestion(input: Record<string, unknown>): ValidationResult<{ question: string; limit: number }> {
  const question = boundedText(input.question, 500);
  if (!question) {
    return { ok: false, error: "question_required", message: "question is required." };
  }
  const rawLimit = Number(input.limit ?? 8);
  const limit = Number.isFinite(rawLimit) ? Math.min(12, Math.max(1, Math.trunc(rawLimit))) : 8;
  return { ok: true, value: { question, limit } };
}

export function validateProductOutcome(input: Record<string, unknown>): ValidationResult<{
  recommendation_id: number;
  score: number;
  note: string | null;
  observed_at: string | null;
}> {
  const recommendationId = positiveId(input.recommendation_id);
  const score = Number(input.score);
  if (!recommendationId) {
    return { ok: false, error: "invalid_recommendation_id", message: "recommendation_id must be a positive integer." };
  }
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { ok: false, error: "invalid_product_score", message: "score must be an integer from 1 to 5." };
  }
  const timestamp = observedAt(input.observed_at);
  if (!timestamp.ok) return timestamp;
  return {
    ok: true,
    value: {
      recommendation_id: recommendationId,
      score,
      note: boundedText(input.note, 500) || null,
      observed_at: timestamp.value
    }
  };
}

export type ProductOutcomeEvidence = {
  recommendation_id: number;
  title: string | null;
  score: number;
};

export type ProductClosureState = "insufficient" | "works" | "mixed" | "did_not_work";
export type ProductLearningState = "insufficient" | "tied" | "favors_product" | "no_product_favored";

export function evaluateProductLearning(outcomes: ProductOutcomeEvidence[]) {
  const groups = new Map<number, ProductOutcomeEvidence[]>();
  for (const outcome of outcomes) {
    groups.set(outcome.recommendation_id, [...(groups.get(outcome.recommendation_id) || []), outcome]);
  }
  const products = [...groups.entries()].map(([recommendationId, rows]) => {
    const mean = average(rows.map((row) => row.score));
    let state: ProductClosureState = "insufficient";
    if (rows.length >= PRODUCT_OUTCOME_MINIMUM && mean != null) {
      state = mean > 3.5 ? "works" : mean < 2.5 ? "did_not_work" : "mixed";
    }
    return {
      recommendation_id: recommendationId,
      title: rows.find((row) => row.title)?.title || null,
      observations: rows.length,
      average_score: mean,
      remaining_for_minimum: Math.max(0, PRODUCT_OUTCOME_MINIMUM - rows.length),
      state,
      relation_closed: state !== "insufficient"
    };
  });
  const eligible = products
    .filter((product) => product.relation_closed && product.average_score != null)
    .sort((a, b) => Number(b.average_score) - Number(a.average_score));
  const top = eligible[0] || null;
  const runnerUp = eligible[1] || null;
  const gap = top && runnerUp ? rounded(Number(top.average_score) - Number(runnerUp.average_score)) : null;

  let state: ProductLearningState = "insufficient";
  if (top) {
    if (runnerUp && gap != null && Math.abs(gap) <= EVIDENCE_TIE_MARGIN) state = "tied";
    else if (Number(top.average_score) > 3.5) state = "favors_product";
    else state = "no_product_favored";
  }
  const favored = state === "favors_product" ? top : null;
  const summary =
    state === "insufficient"
      ? `Insufficient product evidence: record at least ${PRODUCT_OUTCOME_MINIMUM} outcomes for a product before learning from it.`
      : state === "tied"
        ? `Current eligible product evidence is tied within ${EVIDENCE_TIE_MARGIN} points; no single product is favored.`
        : state === "favors_product"
          ? `Current recorded evidence provisionally favors ${favored?.title || `recommendation ${favored?.recommendation_id}`}.`
          : "Enough outcomes were recorded, but no product currently clears the positive-evidence threshold.";

  return {
    state,
    conclusion_available: state === "favors_product" || state === "no_product_favored",
    favored_recommendation_id: favored?.recommendation_id || null,
    favored_title: favored?.title || null,
    summary,
    products,
    evidence: {
      total_observations: outcomes.length,
      eligible_products: eligible.length,
      top_gap: gap,
      minimum_per_product: PRODUCT_OUTCOME_MINIMUM,
      tie_margin: EVIDENCE_TIE_MARGIN
    },
    closure: {
      state,
      minimum_evidence_met: eligible.length > 0,
      relation_closed: state === "favors_product" || state === "no_product_favored"
    },
    caveat:
      "This learns only from outcomes you recorded for yourself. It does not prove causation, product efficacy for other people, or medical benefit."
  };
}

export type SocialProvider = "instagram" | "linkedin" | "tiktok";
export type SocialSourceKind = "user_recorded" | "provider_authorized";

export function validateSocialOutcome(input: Record<string, unknown>): ValidationResult<{
  provider: SocialProvider;
  metric_label: string;
  metric_value: number;
  context_label: string | null;
  source_kind: SocialSourceKind;
  external_ref_hash: string | null;
  observed_at: string | null;
}> {
  const provider =
    input.provider === "instagram" || input.provider === "linkedin" || input.provider === "tiktok"
      ? input.provider
      : null;
  const metricLabel = boundedText(input.metric_label, 120);
  const metricValue = Number(input.metric_value);
  const sourceKind = input.source_kind === "provider_authorized" ? "provider_authorized" : "user_recorded";
  if (!provider) {
    return { ok: false, error: "invalid_social_provider", message: "provider must be instagram, linkedin, or tiktok." };
  }
  if (!metricLabel) {
    return { ok: false, error: "metric_label_required", message: "metric_label is required." };
  }
  if (!Number.isFinite(metricValue) || Math.abs(metricValue) > 1_000_000_000_000) {
    return { ok: false, error: "invalid_metric_value", message: "metric_value must be a finite number." };
  }
  const timestamp = observedAt(input.observed_at);
  if (!timestamp.ok) return timestamp;
  return {
    ok: true,
    value: {
      provider,
      metric_label: metricLabel,
      metric_value: metricValue,
      context_label: boundedText(input.context_label, 200) || null,
      source_kind: sourceKind,
      external_ref_hash: boundedText(input.external_ref_hash, 200) || null,
      observed_at: timestamp.value
    }
  };
}

export type SocialOutcomeEvidence = {
  provider: SocialProvider;
  metric_label: string;
  metric_value: number;
  observed_at: string;
};

export function evaluateSocialOutcomes(outcomes: SocialOutcomeEvidence[]) {
  const groups = new Map<string, SocialOutcomeEvidence[]>();
  for (const outcome of outcomes) {
    const key = `${outcome.provider}\u0000${outcome.metric_label.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) || []), outcome]);
  }
  const relations = [...groups.values()].map((rows) => {
    const sorted = [...rows].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
    const split = Math.floor(sorted.length / 2);
    const earlier = sorted.slice(0, split);
    const later = sorted.slice(split);
    const earlierAverage = average(earlier.map((row) => row.metric_value));
    const laterAverage = average(later.map((row) => row.metric_value));
    const minimumMet = sorted.length >= SOCIAL_MINIMUM_OBSERVATIONS && earlier.length >= 2 && later.length >= 2;
    const delta = earlierAverage == null || laterAverage == null ? null : rounded(laterAverage - earlierAverage);
    const relativeMargin = earlierAverage == null ? EVIDENCE_TIE_MARGIN : Math.max(EVIDENCE_TIE_MARGIN, Math.abs(earlierAverage) * 0.01);
    let state: "insufficient" | "tied" | "improved" | "declined" = "insufficient";
    if (minimumMet && delta != null) {
      state = Math.abs(delta) <= relativeMargin ? "tied" : delta > 0 ? "improved" : "declined";
    }
    return {
      provider: sorted[0].provider,
      metric_label: sorted[0].metric_label,
      state,
      observations: sorted.length,
      earlier_average: earlierAverage,
      later_average: laterAverage,
      delta,
      remaining_for_minimum: Math.max(0, SOCIAL_MINIMUM_OBSERVATIONS - sorted.length),
      closure: {
        minimum_evidence_met: minimumMet,
        relation_closed: state === "improved" || state === "declined"
      }
    };
  });
  return {
    state: relations.length ? "available" : "insufficient",
    relations,
    evidence: { total_observations: outcomes.length, minimum_per_relation: SOCIAL_MINIMUM_OBSERVATIONS },
    scraping: false,
    causal_claim: false,
    caveat:
      "These are within-account metric trends from user-recorded or provider-authorized observations. They do not prove that a post, appearance choice, or product caused the change."
  };
}

export function validateReferenceDefinition(input: Record<string, unknown>): ValidationResult<{
  title: string;
  reference_label: string;
  metric_label: string;
}> {
  const value = {
    title: boundedText(input.title, 200),
    reference_label: boundedText(input.reference_label, 120),
    metric_label: boundedText(input.metric_label, 120)
  };
  if (!value.title || !value.reference_label || !value.metric_label) {
    return { ok: false, error: "reference_definition_required", message: "title, reference_label, and metric_label are required." };
  }
  if (/^(me|myself|self)$/i.test(value.reference_label)) {
    return { ok: false, error: "reference_must_be_distinct", message: "reference_label must remain distinct from the user." };
  }
  return { ok: true, value };
}

export function validateReferenceObservation(input: Record<string, unknown>): ValidationResult<{
  comparison_id: number;
  self_score: number;
  reference_score: number;
  note: string | null;
  observed_at: string | null;
}> {
  const comparisonId = positiveId(input.comparison_id);
  const selfScore = Number(input.self_score);
  const referenceScore = Number(input.reference_score);
  if (!comparisonId) {
    return { ok: false, error: "invalid_comparison_id", message: "comparison_id must be a positive integer." };
  }
  if (![selfScore, referenceScore].every((score) => Number.isInteger(score) && score >= 1 && score <= 5)) {
    return { ok: false, error: "invalid_reference_score", message: "self_score and reference_score must be integers from 1 to 5." };
  }
  const timestamp = observedAt(input.observed_at);
  if (!timestamp.ok) return timestamp;
  return {
    ok: true,
    value: {
      comparison_id: comparisonId,
      self_score: selfScore,
      reference_score: referenceScore,
      note: boundedText(input.note, 500) || null,
      observed_at: timestamp.value
    }
  };
}

export type ReferenceObservationEvidence = { self_score: number; reference_score: number };

export function evaluateReferenceComparison(input: {
  reference_label: string;
  metric_label: string;
  observations: ReferenceObservationEvidence[];
  minimum_pairs?: number;
}) {
  const minimum = Math.max(1, Math.trunc(input.minimum_pairs || REFERENCE_MINIMUM_PAIRS));
  const selfAverage = average(input.observations.map((row) => row.self_score));
  const referenceAverage = average(input.observations.map((row) => row.reference_score));
  const minimumMet = input.observations.length >= minimum;
  const gap = selfAverage == null || referenceAverage == null ? null : rounded(selfAverage - referenceAverage);
  let state: "insufficient" | "tied" | "self_higher" | "reference_higher" = "insufficient";
  if (minimumMet && gap != null) {
    state = Math.abs(gap) <= EVIDENCE_TIE_MARGIN ? "tied" : gap > 0 ? "self_higher" : "reference_higher";
  }
  const summary =
    state === "insufficient"
      ? `Insufficient reference evidence: record at least ${minimum} paired observations.`
      : state === "tied"
        ? `The current paired evidence is tied within ${EVIDENCE_TIE_MARGIN} points on ${input.metric_label}.`
        : state === "self_higher"
          ? `Your current recorded score is provisionally higher than ${input.reference_label} on ${input.metric_label}.`
          : `${input.reference_label} is provisionally higher in the recorded pairs on ${input.metric_label}.`;
  return {
    state,
    conclusion_available: state === "self_higher" || state === "reference_higher",
    summary,
    evidence: {
      observations: input.observations.length,
      self_average: selfAverage,
      reference_average: referenceAverage,
      gap_self_minus_reference: gap,
      minimum_pairs: minimum,
      remaining_for_minimum: Math.max(0, minimum - input.observations.length),
      tie_margin: EVIDENCE_TIE_MARGIN
    },
    closure: {
      state,
      minimum_evidence_met: minimumMet,
      relation_closed: state === "self_higher" || state === "reference_higher"
    },
    caveat:
      "This is a descriptive comparison of paired scores you supplied. It does not identify a person, measure intrinsic worth, establish causation, or generalize to a population."
  };
}

export type HistoryEvidenceDocument = {
  source: "interaction" | "recommendation" | "experiment" | "product_outcome" | "social_outcome" | "reference" | "agent_receipt";
  id: string;
  summary: string;
  occurred_at: string | null;
};

const STOP_WORDS = new Set(["a", "an", "and", "are", "did", "do", "for", "has", "have", "i", "in", "is", "me", "my", "of", "on", "the", "to", "was", "what", "which"]);

function tokens(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]+/g) || [])].filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function answerFromHistory(question: string, documents: HistoryEvidenceDocument[], limit = 8) {
  const queryTokens = tokens(question);
  const normalizedQuestion = question.toLowerCase().trim();
  const matches = documents
    .map((document) => {
      const haystack = document.summary.toLowerCase();
      const tokenHits = queryTokens.filter((token) => haystack.includes(token)).length;
      const exact = normalizedQuestion.length >= 4 && haystack.includes(normalizedQuestion) ? 3 : 0;
      return { ...document, relevance: tokenHits + exact };
    })
    .filter((document) => document.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || Date.parse(b.occurred_at || "1970-01-01") - Date.parse(a.occurred_at || "1970-01-01"))
    .slice(0, Math.min(12, Math.max(1, limit)));
  const state: "answered" | "insufficient" = matches.length ? "answered" : "insufficient";
  return {
    state,
    conclusion_available: matches.length > 0,
    answer: matches.length
      ? `I found ${matches.length} relevant saved evidence record${matches.length === 1 ? "" : "s"}. Most relevant: ${matches[0].summary}`
      : "I could not find saved evidence that directly matches this question, so the history relation remains open.",
    matches,
    evidence: { searched_records: documents.length, matched_records: matches.length, query_tokens: queryTokens },
    closure: { state, relation_closed: matches.length > 0 },
    caveat: "The answer is retrieval from your stored evidence, not a guess from chat context or the public web."
  };
}

export type PersonalAgentActionType =
  | "ask_history"
  | "record_product_outcome"
  | "record_social_outcome"
  | "start_reference_comparison"
  | "start_personal_experiment";

export function validateAgentGoal(input: Record<string, unknown>): ValidationResult<{ goal: string }> {
  const goal = boundedText(input.goal, 500);
  return goal
    ? { ok: true, value: { goal } }
    : { ok: false, error: "agent_goal_required", message: "goal is required." };
}

export function planPersonalAgentAction(goal: string, historyState: "answered" | "insufficient"): {
  action_type: PersonalAgentActionType;
  requires_approval: boolean;
  rationale: string;
} {
  if (historyState === "answered") {
    return {
      action_type: "ask_history",
      requires_approval: false,
      rationale: "The bounded agent found relevant stored evidence and can close the read-only run without a mutation."
    };
  }
  const normalized = goal.toLowerCase();
  if (/product|serum|cream|tool|supplement|recommendation/.test(normalized)) {
    return {
      action_type: "record_product_outcome",
      requires_approval: true,
      rationale: "Product evidence is missing; recording an outcome is the smallest next write and requires approval."
    };
  }
  if (/instagram|linkedin|tiktok|social|post|engagement|impression/.test(normalized)) {
    return {
      action_type: "record_social_outcome",
      requires_approval: true,
      rationale: "Social evidence is missing; only a consented user-recorded or provider-authorized metric may be added."
    };
  }
  if (/reference|compare|benchmark|inspiration|celebrity/.test(normalized)) {
    return {
      action_type: "start_reference_comparison",
      requires_approval: true,
      rationale: "A distinct reference relation is needed; creating it is a persistent write and requires approval."
    };
  }
  return {
    action_type: "start_personal_experiment",
    requires_approval: true,
    rationale: "History is insufficient; a two-option personal experiment is the smallest structured way to gather evidence."
  };
}
