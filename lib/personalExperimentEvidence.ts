export const PERSONAL_EXPERIMENT_ACTION_COST = 1;
export const PERSONAL_EXPERIMENT_READ_ACTION = "personal_experiment:read";
export const PERSONAL_EXPERIMENT_WRITE_ACTION = "personal_experiment:write";
export const PERSONAL_EXPERIMENT_MIN_PER_OPTION = 2;
export const PERSONAL_EXPERIMENT_TIE_MARGIN = 0.25;

export const PERSONAL_EXPERIMENTS = {
  enabled: true as const,
  status: "paid" as const,
  dashboard_status: "PAID" as const,
  action_path: "/api/experiments" as const,
  tables: ["rmf_personal_experiments", "rmf_personal_experiment_outcomes"] as const,
  note:
    "Paid Personal Experiments Actions (OAuth + 1 credit). Define two distinct options, record 1-5 outcomes, and close the evidence relation only when both options have enough observations. Insufficient and tied evidence remain explicit; directional results are provisional personal evidence, not causal or medical claims."
};

export type PersonalExperimentOptionKey = "a" | "b";
export type PersonalExperimentVerdict =
  | "insufficient"
  | "tied"
  | "favors_a"
  | "favors_b";

export type PersonalExperimentOutcomeEvidence = {
  option_key: PersonalExperimentOptionKey;
  score: number;
};

export type PersonalExperimentDefinition = {
  title: string;
  option_a_label: string;
  option_b_label: string;
  metric_label: string;
};

export type PersonalExperimentOptionEvidence = {
  key: PersonalExperimentOptionKey;
  label: string;
  observations: number;
  average_score: number | null;
  remaining_for_minimum: number;
};

export type PersonalExperimentEvaluation = {
  verdict: PersonalExperimentVerdict;
  conclusion_available: boolean;
  favored_option: PersonalExperimentOptionKey | null;
  favored_label: string | null;
  summary: string;
  confidence: "insufficient" | "provisional" | "growing";
  metric_label: string;
  evidence: {
    option_a: PersonalExperimentOptionEvidence;
    option_b: PersonalExperimentOptionEvidence;
    total_observations: number;
    score_gap_a_minus_b: number | null;
    minimum_per_option: number;
    tie_margin: number;
  };
  closure: {
    state: PersonalExperimentVerdict;
    distinct_options: boolean;
    both_options_observed: boolean;
    minimum_evidence_met: boolean;
    relation_closed: boolean;
  };
  caveat: string;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; message: string };

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function validatePersonalExperimentDefinition(
  input: Record<string, unknown>
): ValidationResult<PersonalExperimentDefinition> {
  const value = {
    title: boundedText(input.title, 200),
    option_a_label: boundedText(input.option_a_label, 120),
    option_b_label: boundedText(input.option_b_label, 120),
    metric_label: boundedText(input.metric_label, 120) || "personal outcome"
  };
  if (!value.title || !value.option_a_label || !value.option_b_label) {
    return {
      ok: false,
      error: "experiment_definition_required",
      message: "title, option_a_label, and option_b_label are required."
    };
  }
  if (value.option_a_label.localeCompare(value.option_b_label, undefined, { sensitivity: "accent" }) === 0) {
    return {
      ok: false,
      error: "experiment_options_must_differ",
      message: "The two experiment options must remain distinct."
    };
  }
  return { ok: true, value };
}

export function validatePersonalExperimentOutcome(
  input: Record<string, unknown>
): ValidationResult<{
  experiment_id: number;
  option_key: PersonalExperimentOptionKey;
  score: number;
  note: string | null;
  observed_at: string | null;
}> {
  const experimentId = Number(input.experiment_id);
  const optionKey = input.option_key === "a" || input.option_key === "b" ? input.option_key : null;
  const score = Number(input.score);
  if (!Number.isSafeInteger(experimentId) || experimentId <= 0) {
    return { ok: false, error: "invalid_experiment_id", message: "experiment_id must be a positive integer." };
  }
  if (!optionKey) {
    return { ok: false, error: "invalid_option_key", message: "option_key must be a or b." };
  }
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { ok: false, error: "invalid_outcome_score", message: "score must be an integer from 1 to 5." };
  }
  const rawObservedAt = boundedText(input.observed_at, 80);
  if (rawObservedAt && !Number.isFinite(Date.parse(rawObservedAt))) {
    return { ok: false, error: "invalid_observed_at", message: "observed_at must be an ISO-8601 timestamp." };
  }
  return {
    ok: true,
    value: {
      experiment_id: experimentId,
      option_key: optionKey,
      score,
      note: boundedText(input.note, 500) || null,
      observed_at: rawObservedAt ? new Date(rawObservedAt).toISOString() : null
    }
  };
}

export function evaluatePersonalExperiment(input: {
  option_a_label: string;
  option_b_label: string;
  metric_label?: string | null;
  outcomes: PersonalExperimentOutcomeEvidence[];
  minimum_per_option?: number;
  tie_margin?: number;
}): PersonalExperimentEvaluation {
  const minimum = Math.max(1, Math.trunc(input.minimum_per_option || PERSONAL_EXPERIMENT_MIN_PER_OPTION));
  const tieMargin = Math.max(0, input.tie_margin ?? PERSONAL_EXPERIMENT_TIE_MARGIN);
  const scoresA = input.outcomes.filter((row) => row.option_key === "a").map((row) => row.score);
  const scoresB = input.outcomes.filter((row) => row.option_key === "b").map((row) => row.score);
  const average = (values: number[]) =>
    values.length ? rounded(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  const averageA = average(scoresA);
  const averageB = average(scoresB);
  const minimumMet = scoresA.length >= minimum && scoresB.length >= minimum;
  const bothObserved = scoresA.length > 0 && scoresB.length > 0;
  const gap = averageA == null || averageB == null ? null : rounded(averageA - averageB);

  let verdict: PersonalExperimentVerdict = "insufficient";
  if (minimumMet && gap != null) {
    if (Math.abs(gap) <= tieMargin) verdict = "tied";
    else verdict = gap > 0 ? "favors_a" : "favors_b";
  }

  const favoredOption = verdict === "favors_a" ? "a" : verdict === "favors_b" ? "b" : null;
  const favoredLabel = favoredOption === "a" ? input.option_a_label : favoredOption === "b" ? input.option_b_label : null;
  const total = scoresA.length + scoresB.length;
  const confidence = !minimumMet ? "insufficient" : total >= 8 ? "growing" : "provisional";
  const metricLabel = boundedText(input.metric_label, 120) || "personal outcome";
  const summary =
    verdict === "insufficient"
      ? `Insufficient evidence: record at least ${minimum} outcomes for each option before drawing a directional conclusion.`
      : verdict === "tied"
        ? `Current evidence is tied within ${tieMargin} points on ${metricLabel}; neither option is favored.`
        : `Current recorded evidence provisionally favors ${favoredLabel} on ${metricLabel}.`;

  return {
    verdict,
    conclusion_available: favoredOption != null,
    favored_option: favoredOption,
    favored_label: favoredLabel,
    summary,
    confidence,
    metric_label: metricLabel,
    evidence: {
      option_a: {
        key: "a",
        label: input.option_a_label,
        observations: scoresA.length,
        average_score: averageA,
        remaining_for_minimum: Math.max(0, minimum - scoresA.length)
      },
      option_b: {
        key: "b",
        label: input.option_b_label,
        observations: scoresB.length,
        average_score: averageB,
        remaining_for_minimum: Math.max(0, minimum - scoresB.length)
      },
      total_observations: total,
      score_gap_a_minus_b: gap,
      minimum_per_option: minimum,
      tie_margin: tieMargin
    },
    closure: {
      state: verdict,
      distinct_options: input.option_a_label !== input.option_b_label,
      both_options_observed: bothObserved,
      minimum_evidence_met: minimumMet,
      relation_closed: favoredOption != null
    },
    caveat:
      "This is a closure over the outcomes you recorded for yourself. It is provisional personal evidence, not proof of causation, population evidence, or medical advice."
  };
}
