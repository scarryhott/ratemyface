import { databaseConfigured, db } from "./db";
import {
  PERSONAL_EXPERIMENT_MIN_PER_OPTION,
  evaluatePersonalExperiment,
  validatePersonalExperimentDefinition,
  validatePersonalExperimentOutcome,
  type PersonalExperimentEvaluation,
  type PersonalExperimentOptionKey
} from "./personalExperimentEvidence";

type ExperimentRow = {
  id: unknown;
  user_id: unknown;
  title: unknown;
  option_a_label: unknown;
  option_b_label: unknown;
  metric_label: unknown;
  status: unknown;
  minimum_per_option: unknown;
  created_at: unknown;
  updated_at: unknown;
  completed_at: unknown;
};

type OutcomeRow = {
  id: unknown;
  experiment_id: unknown;
  option_key: unknown;
  score: unknown;
  note: unknown;
  observed_at: unknown;
  created_at: unknown;
};

export type PersonalExperimentOutcome = {
  id: number;
  experiment_id: number;
  option_key: PersonalExperimentOptionKey;
  score: number;
  note: string | null;
  observed_at: unknown;
  created_at: unknown;
};

export type PersonalExperimentView = {
  id: number;
  title: string;
  option_a_label: string;
  option_b_label: string;
  metric_label: string;
  status: string;
  minimum_per_option: number;
  created_at: unknown;
  updated_at: unknown;
  completed_at: unknown;
  outcomes: PersonalExperimentOutcome[];
  evaluation: PersonalExperimentEvaluation;
};

export type PersonalExperimentMutationResult =
  | { ok: true; operation: "create" | "record_outcome" | "complete"; experiment: PersonalExperimentView }
  | { ok: false; error: string; message: string };

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function asOptionKey(value: unknown): PersonalExperimentOptionKey {
  return value === "b" ? "b" : "a";
}

export async function personalExperimentTablesReady(): Promise<boolean> {
  if (!databaseConfigured()) return false;
  const sql = db();
  const rows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('rmf_personal_experiments', 'rmf_personal_experiment_outcomes')
  `;
  return new Set(rows.map((row) => String(row.table_name))).size === 2;
}

function buildView(row: ExperimentRow, outcomes: PersonalExperimentOutcome[]): PersonalExperimentView {
  const id = Number(row.id);
  const optionALabel = String(row.option_a_label || "Option A");
  const optionBLabel = String(row.option_b_label || "Option B");
  const metricLabel = String(row.metric_label || "personal outcome");
  const minimum = Math.max(1, Number(row.minimum_per_option) || PERSONAL_EXPERIMENT_MIN_PER_OPTION);
  return {
    id,
    title: String(row.title || "Personal experiment"),
    option_a_label: optionALabel,
    option_b_label: optionBLabel,
    metric_label: metricLabel,
    status: String(row.status || "active"),
    minimum_per_option: minimum,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    outcomes,
    evaluation: evaluatePersonalExperiment({
      option_a_label: optionALabel,
      option_b_label: optionBLabel,
      metric_label: metricLabel,
      minimum_per_option: minimum,
      outcomes: outcomes.map((outcome) => ({
        option_key: outcome.option_key,
        score: outcome.score
      }))
    })
  };
}

export async function readPersonalExperiments(
  userId: string,
  input: { experiment_id?: number | null; limit?: number } = {}
): Promise<PersonalExperimentView[]> {
  const sql = db();
  const experimentId = input.experiment_id == null ? null : positiveId(input.experiment_id);
  const limit = Math.min(50, Math.max(1, Math.trunc(input.limit || 20)));
  const rows = (experimentId
    ? await sql`
        select id,user_id,title,option_a_label,option_b_label,metric_label,status,
          minimum_per_option,created_at,updated_at,completed_at
        from rmf_personal_experiments
        where user_id=${userId} and id=${experimentId}
        limit 1
      `
    : await sql`
        select id,user_id,title,option_a_label,option_b_label,metric_label,status,
          minimum_per_option,created_at,updated_at,completed_at
        from rmf_personal_experiments
        where user_id=${userId}
        order by updated_at desc
        limit ${limit}
      `) as unknown as ExperimentRow[];
  const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isSafeInteger(id));
  if (!ids.length) return [];
  const outcomeRows = (await sql`
    select id,experiment_id,option_key,score,note,observed_at,created_at
    from rmf_personal_experiment_outcomes
    where user_id=${userId} and experiment_id in ${sql(ids)}
    order by observed_at asc, id asc
  `) as unknown as OutcomeRow[];
  const outcomesByExperiment = new Map<number, PersonalExperimentOutcome[]>();
  for (const row of outcomeRows) {
    const experiment = Number(row.experiment_id);
    const outcome: PersonalExperimentOutcome = {
      id: Number(row.id),
      experiment_id: experiment,
      option_key: asOptionKey(row.option_key),
      score: Number(row.score),
      note: row.note == null ? null : String(row.note),
      observed_at: row.observed_at,
      created_at: row.created_at
    };
    outcomesByExperiment.set(experiment, [...(outcomesByExperiment.get(experiment) || []), outcome]);
  }
  return rows.map((row) => buildView(row, outcomesByExperiment.get(Number(row.id)) || []));
}

export async function createPersonalExperiment(
  userId: string,
  input: Record<string, unknown>
): Promise<PersonalExperimentMutationResult> {
  const validation = validatePersonalExperimentDefinition(input);
  if (!validation.ok) return validation;
  const sql = db();
  const value = validation.value;
  const rows = await sql`
    insert into rmf_personal_experiments
      (user_id,title,option_a_label,option_b_label,metric_label,minimum_per_option)
    values
      (${userId},${value.title},${value.option_a_label},${value.option_b_label},
       ${value.metric_label},${PERSONAL_EXPERIMENT_MIN_PER_OPTION})
    returning id
  `;
  const created = await readPersonalExperiments(userId, { experiment_id: Number(rows[0].id) });
  return { ok: true, operation: "create", experiment: created[0] };
}

export async function recordPersonalExperimentOutcome(
  userId: string,
  input: Record<string, unknown>
): Promise<PersonalExperimentMutationResult> {
  const validation = validatePersonalExperimentOutcome(input);
  if (!validation.ok) return validation;
  const value = validation.value;
  const sql = db();
  const write = await sql.begin(async (tx) => {
    const experiments = await tx`
      select id,status from rmf_personal_experiments
      where id=${value.experiment_id} and user_id=${userId}
      for update
    `;
    if (!experiments[0]) return { ok: false as const, error: "experiment_not_found", message: "Personal experiment not found." };
    if (String(experiments[0].status) !== "active") {
      return {
        ok: false as const,
        error: "experiment_not_active",
        message: "Outcomes can only be added while the personal experiment is active."
      };
    }
    if (value.observed_at) {
      await tx`
        insert into rmf_personal_experiment_outcomes
          (experiment_id,user_id,option_key,score,note,observed_at)
        values
          (${value.experiment_id},${userId},${value.option_key},${value.score},${value.note},
           ${value.observed_at}::timestamptz)
      `;
    } else {
      await tx`
        insert into rmf_personal_experiment_outcomes
          (experiment_id,user_id,option_key,score,note)
        values
          (${value.experiment_id},${userId},${value.option_key},${value.score},${value.note})
      `;
    }
    await tx`
      update rmf_personal_experiments set updated_at=now()
      where id=${value.experiment_id} and user_id=${userId}
    `;
    return { ok: true as const };
  });
  if (!write.ok) return write;
  const experiments = await readPersonalExperiments(userId, { experiment_id: value.experiment_id });
  return { ok: true, operation: "record_outcome", experiment: experiments[0] };
}

export async function completePersonalExperiment(
  userId: string,
  experimentIdInput: unknown
): Promise<PersonalExperimentMutationResult> {
  const experimentId = positiveId(experimentIdInput);
  if (!experimentId) {
    return { ok: false, error: "invalid_experiment_id", message: "experiment_id must be a positive integer." };
  }
  const sql = db();
  const rows = await sql`
    update rmf_personal_experiments
    set status='completed', completed_at=coalesce(completed_at,now()), updated_at=now()
    where id=${experimentId} and user_id=${userId}
    returning id
  `;
  if (!rows[0]) {
    return { ok: false, error: "experiment_not_found", message: "Personal experiment not found." };
  }
  const experiments = await readPersonalExperiments(userId, { experiment_id: experimentId });
  return { ok: true, operation: "complete", experiment: experiments[0] };
}
