import { databaseConfigured, db } from "./db";
import type postgres from "postgres";
import { readPersonalExperiments } from "./personalExperiments";
import { history, savedItems } from "./personalNetwork";
import {
  PERSONAL_INTELLIGENCE,
  REFERENCE_MINIMUM_PAIRS,
  answerFromHistory,
  evaluateProductLearning,
  evaluateReferenceComparison,
  evaluateSocialOutcomes,
  planPersonalAgentAction,
  positiveId,
  type HistoryEvidenceDocument,
  type PersonalAgentActionType,
  type SocialProvider,
  type SocialSourceKind
} from "./personalIntelligenceEvidence";

type AnyRow = Record<string, unknown>;

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : String(value || "");
}

function safeJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function personalIntelligenceTablesReady(): Promise<boolean> {
  if (!databaseConfigured()) return false;
  const sql = db();
  const rows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ${sql([...PERSONAL_INTELLIGENCE.tables])}
  `;
  return new Set(rows.map((row) => String(row.table_name))).size === PERSONAL_INTELLIGENCE.tables.length;
}

export async function readProductOutcomes(userId: string, limit = 100) {
  const sql = db();
  const rows = (await sql`
    select o.id,o.recommendation_id,o.score,o.note,o.observed_at,o.created_at,
      r.title,r.url,r.item_type
    from rmf_product_outcomes o
    join rmf_personal_recommendations r
      on r.id=o.recommendation_id and r.user_id=o.user_id
    where o.user_id=${userId}
    order by o.observed_at desc,o.id desc
    limit ${Math.min(200, Math.max(1, Math.trunc(limit)))}
  `) as unknown as AnyRow[];
  return rows.map((row) => ({
    id: Number(row.id),
    recommendation_id: Number(row.recommendation_id),
    title: row.title == null ? null : String(row.title),
    url: row.url == null ? null : String(row.url),
    item_type: String(row.item_type || "product"),
    score: Number(row.score),
    note: row.note == null ? null : String(row.note),
    observed_at: asIso(row.observed_at),
    created_at: asIso(row.created_at)
  }));
}

export async function getProductLearning(userId: string) {
  const outcomes = await readProductOutcomes(userId, 200);
  return {
    ...evaluateProductLearning(
      outcomes.map((row) => ({
        recommendation_id: row.recommendation_id,
        title: row.title,
        score: row.score
      }))
    ),
    outcomes
  };
}

export async function recordProductOutcome(
  userId: string,
  input: { recommendation_id: number; score: number; note: string | null; observed_at: string | null }
) {
  const sql = db();
  const write = await sql.begin(async (tx) => {
    const recommendations = await tx`
      select id,item_type,title
      from rmf_personal_recommendations
      where id=${input.recommendation_id} and user_id=${userId}
      for update
    `;
    if (!recommendations[0]) {
      return { ok: false as const, error: "recommendation_not_found", message: "Product recommendation not found." };
    }
    if (String(recommendations[0].item_type || "product") !== "product") {
      return { ok: false as const, error: "recommendation_not_product", message: "The selected recommendation is not a product." };
    }
    const rows = input.observed_at
      ? await tx`
          insert into rmf_product_outcomes(recommendation_id,user_id,score,note,observed_at)
          values(${input.recommendation_id},${userId},${input.score},${input.note},${input.observed_at}::timestamptz)
          returning id,recommendation_id,score,note,observed_at,created_at
        `
      : await tx`
          insert into rmf_product_outcomes(recommendation_id,user_id,score,note)
          values(${input.recommendation_id},${userId},${input.score},${input.note})
          returning id,recommendation_id,score,note,observed_at,created_at
        `;
    return { ok: true as const, outcome: rows[0] };
  });
  if (!write.ok) return write;
  return { ok: true as const, outcome: write.outcome, learning: await getProductLearning(userId) };
}

export async function connectedSocialProvider(userId: string, provider: SocialProvider): Promise<boolean> {
  const sql = db();
  const rows = await sql`
    select 1
    from rmf_provider_connections
    where user_id=${userId} and provider=${provider} and status='connected'
    limit 1
  `;
  return Boolean(rows[0]);
}

export async function readSocialOutcomes(userId: string, limit = 200) {
  const sql = db();
  const rows = (await sql`
    select id,provider,metric_label,metric_value,context_label,source_kind,
      external_ref_hash,observed_at,created_at
    from rmf_social_outcomes
    where user_id=${userId}
    order by observed_at desc,id desc
    limit ${Math.min(500, Math.max(1, Math.trunc(limit)))}
  `) as unknown as AnyRow[];
  return rows.map((row) => ({
    id: Number(row.id),
    provider: String(row.provider) as SocialProvider,
    metric_label: String(row.metric_label),
    metric_value: Number(row.metric_value),
    context_label: row.context_label == null ? null : String(row.context_label),
    source_kind: String(row.source_kind) as SocialSourceKind,
    external_ref_hash: row.external_ref_hash == null ? null : String(row.external_ref_hash),
    observed_at: asIso(row.observed_at),
    created_at: asIso(row.created_at)
  }));
}

export async function getSocialOutcomeIntelligence(userId: string) {
  const outcomes = await readSocialOutcomes(userId);
  return {
    ...evaluateSocialOutcomes(
      outcomes.map((row) => ({
        provider: row.provider,
        metric_label: row.metric_label,
        metric_value: row.metric_value,
        observed_at: row.observed_at
      }))
    ),
    outcomes
  };
}

export async function recordSocialOutcome(
  userId: string,
  input: {
    provider: SocialProvider;
    metric_label: string;
    metric_value: number;
    context_label: string | null;
    source_kind: SocialSourceKind;
    external_ref_hash: string | null;
    observed_at: string | null;
  }
) {
  if (input.source_kind === "provider_authorized" && !(await connectedSocialProvider(userId, input.provider))) {
    return {
      ok: false as const,
      error: "provider_not_connected",
      message: "Provider-authorized evidence requires an active OAuth connection. Use user_recorded for a manual metric."
    };
  }
  const sql = db();
  const rows = input.observed_at
    ? await sql`
        insert into rmf_social_outcomes
          (user_id,provider,metric_label,metric_value,context_label,source_kind,external_ref_hash,observed_at)
        values
          (${userId},${input.provider},${input.metric_label},${input.metric_value},${input.context_label},
           ${input.source_kind},${input.external_ref_hash},${input.observed_at}::timestamptz)
        returning id,provider,metric_label,metric_value,source_kind,observed_at,created_at
      `
    : await sql`
        insert into rmf_social_outcomes
          (user_id,provider,metric_label,metric_value,context_label,source_kind,external_ref_hash)
        values
          (${userId},${input.provider},${input.metric_label},${input.metric_value},${input.context_label},
           ${input.source_kind},${input.external_ref_hash})
        returning id,provider,metric_label,metric_value,source_kind,observed_at,created_at
      `;
  return { ok: true as const, outcome: rows[0], intelligence: await getSocialOutcomeIntelligence(userId) };
}

type ReferenceRow = AnyRow & {
  id: unknown;
  title: unknown;
  reference_label: unknown;
  metric_label: unknown;
  status: unknown;
  minimum_pairs: unknown;
};

export async function readReferenceComparisons(
  userId: string,
  input: { comparison_id?: number | null; limit?: number } = {}
) {
  const sql = db();
  const id = input.comparison_id == null ? null : positiveId(input.comparison_id);
  const limit = Math.min(50, Math.max(1, Math.trunc(input.limit || 20)));
  const comparisons = (id
    ? await sql`
        select id,title,reference_label,metric_label,status,minimum_pairs,created_at,updated_at,completed_at
        from rmf_reference_comparisons
        where user_id=${userId} and id=${id}
        limit 1
      `
    : await sql`
        select id,title,reference_label,metric_label,status,minimum_pairs,created_at,updated_at,completed_at
        from rmf_reference_comparisons
        where user_id=${userId}
        order by updated_at desc
        limit ${limit}
      `) as unknown as ReferenceRow[];
  const ids = comparisons.map((row) => Number(row.id)).filter(Number.isSafeInteger);
  if (!ids.length) return [];
  const observationRows = (await sql`
    select id,comparison_id,self_score,reference_score,note,observed_at,created_at
    from rmf_reference_observations
    where user_id=${userId} and comparison_id in ${sql(ids)}
    order by observed_at asc,id asc
  `) as unknown as AnyRow[];
  const byComparison = new Map<number, AnyRow[]>();
  for (const row of observationRows) {
    const comparisonId = Number(row.comparison_id);
    byComparison.set(comparisonId, [...(byComparison.get(comparisonId) || []), row]);
  }
  return comparisons.map((row) => {
    const observations = (byComparison.get(Number(row.id)) || []).map((observation) => ({
      id: Number(observation.id),
      comparison_id: Number(observation.comparison_id),
      self_score: Number(observation.self_score),
      reference_score: Number(observation.reference_score),
      note: observation.note == null ? null : String(observation.note),
      observed_at: asIso(observation.observed_at),
      created_at: asIso(observation.created_at)
    }));
    return {
      id: Number(row.id),
      title: String(row.title),
      reference_label: String(row.reference_label),
      metric_label: String(row.metric_label),
      status: String(row.status),
      minimum_pairs: Number(row.minimum_pairs),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      completed_at: row.completed_at == null ? null : asIso(row.completed_at),
      observations,
      evaluation: evaluateReferenceComparison({
        reference_label: String(row.reference_label),
        metric_label: String(row.metric_label),
        minimum_pairs: Number(row.minimum_pairs),
        observations: observations.map((observation) => ({
          self_score: observation.self_score,
          reference_score: observation.reference_score
        }))
      })
    };
  });
}

export async function createReferenceComparison(
  userId: string,
  input: { title: string; reference_label: string; metric_label: string }
) {
  const sql = db();
  const rows = await sql`
    insert into rmf_reference_comparisons
      (user_id,title,reference_label,metric_label,minimum_pairs)
    values
      (${userId},${input.title},${input.reference_label},${input.metric_label},${REFERENCE_MINIMUM_PAIRS})
    returning id
  `;
  const comparisons = await readReferenceComparisons(userId, { comparison_id: Number(rows[0].id) });
  return { ok: true as const, operation: "create" as const, comparison: comparisons[0] };
}

export async function recordReferenceObservation(
  userId: string,
  input: {
    comparison_id: number;
    self_score: number;
    reference_score: number;
    note: string | null;
    observed_at: string | null;
  }
) {
  const sql = db();
  const write = await sql.begin(async (tx) => {
    const comparisons = await tx`
      select id,status
      from rmf_reference_comparisons
      where id=${input.comparison_id} and user_id=${userId}
      for update
    `;
    if (!comparisons[0]) {
      return { ok: false as const, error: "comparison_not_found", message: "Reference comparison not found." };
    }
    if (String(comparisons[0].status) !== "active") {
      return { ok: false as const, error: "comparison_not_active", message: "Observations can only be added to an active comparison." };
    }
    if (input.observed_at) {
      await tx`
        insert into rmf_reference_observations
          (comparison_id,user_id,self_score,reference_score,note,observed_at)
        values
          (${input.comparison_id},${userId},${input.self_score},${input.reference_score},${input.note},
           ${input.observed_at}::timestamptz)
      `;
    } else {
      await tx`
        insert into rmf_reference_observations
          (comparison_id,user_id,self_score,reference_score,note)
        values
          (${input.comparison_id},${userId},${input.self_score},${input.reference_score},${input.note})
      `;
    }
    await tx`
      update rmf_reference_comparisons set updated_at=now()
      where id=${input.comparison_id} and user_id=${userId}
    `;
    return { ok: true as const };
  });
  if (!write.ok) return write;
  const comparisons = await readReferenceComparisons(userId, { comparison_id: input.comparison_id });
  return { ok: true as const, operation: "record_observation" as const, comparison: comparisons[0] };
}

export async function completeReferenceComparison(userId: string, comparisonIdInput: unknown) {
  const comparisonId = positiveId(comparisonIdInput);
  if (!comparisonId) {
    return { ok: false as const, error: "invalid_comparison_id", message: "comparison_id must be a positive integer." };
  }
  const sql = db();
  const rows = await sql`
    update rmf_reference_comparisons
    set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
    where id=${comparisonId} and user_id=${userId}
    returning id
  `;
  if (!rows[0]) {
    return { ok: false as const, error: "comparison_not_found", message: "Reference comparison not found." };
  }
  const comparisons = await readReferenceComparisons(userId, { comparison_id: comparisonId });
  return { ok: true as const, operation: "complete" as const, comparison: comparisons[0] };
}

export async function askMyHistory(userId: string, question: string, limit = 8) {
  const sql = db();
  const [interactions, recommendations, experiments, productOutcomes, socialOutcomes, references, receiptRows] =
    await Promise.all([
      history(userId, 50),
      savedItems(userId, 50),
      readPersonalExperiments(userId, { limit: 30 }),
      readProductOutcomes(userId, 100),
      readSocialOutcomes(userId, 100),
      readReferenceComparisons(userId, { limit: 30 }),
      sql`
        select p.id,p.receipt_type,p.verified,p.observed,p.created_at,r.goal,a.action_type
        from rmf_personal_agent_receipts p
        join rmf_personal_agent_runs r on r.id=p.run_id and r.user_id=p.user_id
        join rmf_personal_agent_actions a on a.id=p.action_id and a.user_id=p.user_id
        where p.user_id=${userId}
        order by p.created_at desc
        limit 30
      `
    ]);
  const documents: HistoryEvidenceDocument[] = [];
  for (const row of interactions as unknown as AnyRow[]) {
    documents.push({
      source: "interaction",
      id: String(row.id),
      summary: `${String(row.kind)}: ${String(row.summary)}`.slice(0, 1200),
      occurred_at: asIso(row.created_at)
    });
  }
  for (const row of recommendations as unknown as AnyRow[]) {
    const feedback = row.feedback == null ? "no recorded feedback" : `feedback: ${String(row.feedback)}`;
    documents.push({
      source: "recommendation",
      id: String(row.id),
      summary: `Saved ${String(row.item_type || "product")} ${String(row.title || "recommendation")}; ${feedback}. ${JSON.stringify(safeJson(row.data)).slice(0, 500)}`,
      occurred_at: asIso(row.updated_at || row.created_at)
    });
  }
  for (const experiment of experiments) {
    documents.push({
      source: "experiment",
      id: String(experiment.id),
      summary: `${experiment.title}: ${experiment.option_a_label} versus ${experiment.option_b_label}. ${experiment.evaluation.summary}`,
      occurred_at: asIso(experiment.updated_at)
    });
  }
  for (const outcome of productOutcomes) {
    documents.push({
      source: "product_outcome",
      id: String(outcome.id),
      summary: `Product ${outcome.title || outcome.recommendation_id} outcome ${outcome.score}/5${outcome.note ? `: ${outcome.note}` : ""}.`,
      occurred_at: outcome.observed_at
    });
  }
  for (const outcome of socialOutcomes) {
    documents.push({
      source: "social_outcome",
      id: String(outcome.id),
      summary: `${outcome.provider} ${outcome.metric_label}: ${outcome.metric_value}${outcome.context_label ? ` for ${outcome.context_label}` : ""}; ${outcome.source_kind}.`,
      occurred_at: outcome.observed_at
    });
  }
  for (const comparison of references) {
    documents.push({
      source: "reference",
      id: String(comparison.id),
      summary: `${comparison.title} against ${comparison.reference_label}. ${comparison.evaluation.summary}`,
      occurred_at: comparison.updated_at
    });
  }
  for (const row of receiptRows as unknown as AnyRow[]) {
    documents.push({
      source: "agent_receipt",
      id: String(row.id),
      summary: `Agent goal ${String(row.goal)}; ${String(row.action_type)} ${String(row.receipt_type)} receipt; verified=${Boolean(row.verified)}. ${JSON.stringify(safeJson(row.observed)).slice(0, 400)}`,
      occurred_at: asIso(row.created_at)
    });
  }
  return answerFromHistory(question, documents, limit);
}

export async function readPersonalAgentRuns(
  userId: string,
  input: { run_id?: number | null; limit?: number } = {}
) {
  const sql = db();
  const runId = input.run_id == null ? null : positiveId(input.run_id);
  const limit = Math.min(50, Math.max(1, Math.trunc(input.limit || 20)));
  const runs = (runId
    ? await sql`
        select id,goal,status,authority,closure_state,evidence_snapshot,created_at,updated_at,completed_at
        from rmf_personal_agent_runs where user_id=${userId} and id=${runId} limit 1
      `
    : await sql`
        select id,goal,status,authority,closure_state,evidence_snapshot,created_at,updated_at,completed_at
        from rmf_personal_agent_runs where user_id=${userId} order by updated_at desc limit ${limit}
      `) as unknown as AnyRow[];
  const ids = runs.map((row) => Number(row.id)).filter(Number.isSafeInteger);
  if (!ids.length) return [];
  const [actions, receipts] = await Promise.all([
    sql`
      select id,run_id,action_type,status,requires_approval,rationale,payload,approved_at,completed_at,created_at
      from rmf_personal_agent_actions where user_id=${userId} and run_id in ${sql(ids)} order by id
    `,
    sql`
      select id,run_id,action_id,receipt_type,expected,observed,verified,created_at
      from rmf_personal_agent_receipts where user_id=${userId} and run_id in ${sql(ids)} order by id
    `
  ]);
  return runs.map((run) => ({
    id: Number(run.id),
    goal: String(run.goal),
    status: String(run.status),
    authority: Number(run.authority),
    closure_state: String(run.closure_state),
    evidence_snapshot: safeJson(run.evidence_snapshot),
    created_at: asIso(run.created_at),
    updated_at: asIso(run.updated_at),
    completed_at: run.completed_at == null ? null : asIso(run.completed_at),
    actions: (actions as unknown as AnyRow[])
      .filter((action) => Number(action.run_id) === Number(run.id))
      .map((action) => ({
        id: Number(action.id),
        run_id: Number(action.run_id),
        action_type: String(action.action_type),
        status: String(action.status),
        requires_approval: Boolean(action.requires_approval),
        rationale: String(action.rationale),
        payload: safeJson(action.payload),
        approved_at: action.approved_at == null ? null : asIso(action.approved_at),
        completed_at: action.completed_at == null ? null : asIso(action.completed_at),
        created_at: asIso(action.created_at)
      })),
    receipts: (receipts as unknown as AnyRow[])
      .filter((receipt) => Number(receipt.run_id) === Number(run.id))
      .map((receipt) => ({
        id: Number(receipt.id),
        run_id: Number(receipt.run_id),
        action_id: Number(receipt.action_id),
        receipt_type: String(receipt.receipt_type),
        expected: safeJson(receipt.expected),
        observed: safeJson(receipt.observed),
        verified: Boolean(receipt.verified),
        created_at: asIso(receipt.created_at)
      }))
  }));
}

export async function runPersonalAgent(userId: string, goal: string) {
  const historyAnswer = await askMyHistory(userId, goal, 5);
  const plan = planPersonalAgentAction(goal, historyAnswer.state);
  const completed = !plan.requires_approval;
  const sql = db();
  const result = await sql.begin(async (tx) => {
    const snapshot = {
      question: goal,
      history_state: historyAnswer.state,
      searched_records: historyAnswer.evidence.searched_records,
      matched_records: historyAnswer.evidence.matched_records,
      match_refs: historyAnswer.matches.map((match) => `${match.source}:${match.id}`)
    };
    const runs = await tx`
      insert into rmf_personal_agent_runs
        (user_id,goal,status,authority,closure_state,evidence_snapshot,completed_at)
      values
        (${userId},${goal},${completed ? "completed" : "awaiting_approval"},0,
         ${completed ? "evidence_found" : "insufficient"},${tx.json(snapshot as any)},
         ${completed ? new Date().toISOString() : null}::timestamptz)
      returning id
    `;
    const runId = Number(runs[0].id);
    const actions = await tx`
      insert into rmf_personal_agent_actions
        (run_id,user_id,action_type,status,requires_approval,rationale,payload,completed_at)
      values
        (${runId},${userId},${plan.action_type},${completed ? "completed" : "proposed"},
         ${plan.requires_approval},${plan.rationale},
         ${tx.json({ question: goal, history_state: historyAnswer.state } as any)},
         ${completed ? new Date().toISOString() : null}::timestamptz)
      returning id
    `;
    const actionId = Number(actions[0].id);
    await tx`
      insert into rmf_personal_agent_receipts
        (run_id,action_id,user_id,receipt_type,expected,observed,verified)
      values
        (${runId},${actionId},${userId},'read',
         ${tx.json({ operation: "ask_history", bounded_read: true } as any)},
         ${tx.json({ state: historyAnswer.state, matches: historyAnswer.matches.map((match) => `${match.source}:${match.id}`) } as any)},
         true)
    `;
    return { runId };
  });
  const runs = await readPersonalAgentRuns(userId, { run_id: result.runId });
  return { ok: true as const, operation: "run" as const, run: runs[0], history_answer: historyAnswer };
}

export async function decidePersonalAgentAction(
  userId: string,
  input: { run_id: number; action_id: number; approve: boolean }
) {
  const sql = db();
  const result = await sql.begin(async (tx) => {
    const rows = await tx`
      select a.id,a.status,a.requires_approval,r.status as run_status
      from rmf_personal_agent_actions a
      join rmf_personal_agent_runs r on r.id=a.run_id and r.user_id=a.user_id
      where a.id=${input.action_id} and a.run_id=${input.run_id} and a.user_id=${userId}
      for update of a,r
    `;
    if (!rows[0]) {
      return { ok: false as const, error: "agent_action_not_found", message: "Personal agent action not found." };
    }
    if (String(rows[0].status) !== "proposed") {
      return { ok: false as const, error: "agent_action_not_proposed", message: "Only a proposed action can be approved or rejected." };
    }
    const actionStatus = input.approve ? "approved" : "rejected";
    const runStatus = input.approve ? "approved" : "rejected";
    const closure = input.approve ? "approved" : "rejected";
    await tx`
      update rmf_personal_agent_actions
      set status=${actionStatus},approved_at=${input.approve ? new Date().toISOString() : null}::timestamptz,
        completed_at=${input.approve ? null : new Date().toISOString()}::timestamptz
      where id=${input.action_id} and run_id=${input.run_id} and user_id=${userId}
    `;
    await tx`
      update rmf_personal_agent_runs
      set status=${runStatus},closure_state=${closure},updated_at=now(),
        completed_at=${input.approve ? null : new Date().toISOString()}::timestamptz
      where id=${input.run_id} and user_id=${userId}
    `;
    await tx`
      insert into rmf_personal_agent_receipts
        (run_id,action_id,user_id,receipt_type,expected,observed,verified)
      values
        (${input.run_id},${input.action_id},${userId},'approval',
         ${tx.json({ explicit_decision_required: true } as any)},
         ${tx.json({ decision: input.approve ? "approved" : "rejected" } as any)},true)
    `;
    return { ok: true as const };
  });
  if (!result.ok) return result;
  const runs = await readPersonalAgentRuns(userId, { run_id: input.run_id });
  return { ok: true as const, operation: "decide" as const, run: runs[0] };
}

async function evidenceRefVerified(
  tx: postgres.TransactionSql,
  userId: string,
  actionType: PersonalAgentActionType,
  evidenceRef: string
): Promise<boolean> {
  const [kind, rawId] = evidenceRef.split(":", 2);
  const id = positiveId(rawId);
  if (!id) return false;
  if (actionType === "record_product_outcome" && kind === "product_outcome") {
    return Boolean((await tx`select 1 from rmf_product_outcomes where id=${id} and user_id=${userId} limit 1`)[0]);
  }
  if (actionType === "record_social_outcome" && kind === "social_outcome") {
    return Boolean((await tx`select 1 from rmf_social_outcomes where id=${id} and user_id=${userId} limit 1`)[0]);
  }
  if (actionType === "start_reference_comparison" && kind === "reference_comparison") {
    return Boolean((await tx`select 1 from rmf_reference_comparisons where id=${id} and user_id=${userId} limit 1`)[0]);
  }
  if (actionType === "start_personal_experiment" && kind === "personal_experiment") {
    return Boolean((await tx`select 1 from rmf_personal_experiments where id=${id} and user_id=${userId} limit 1`)[0]);
  }
  return false;
}

export async function completePersonalAgentAction(
  userId: string,
  input: { run_id: number; action_id: number; evidence_ref: string; outcome_summary: string }
) {
  const sql = db();
  const result = await sql.begin(async (tx) => {
    const rows = await tx`
      select a.id,a.action_type,a.status
      from rmf_personal_agent_actions a
      join rmf_personal_agent_runs r on r.id=a.run_id and r.user_id=a.user_id
      where a.id=${input.action_id} and a.run_id=${input.run_id} and a.user_id=${userId}
      for update of a,r
    `;
    if (!rows[0]) {
      return { ok: false as const, error: "agent_action_not_found", message: "Personal agent action not found." };
    }
    if (String(rows[0].status) !== "approved") {
      return { ok: false as const, error: "agent_action_not_approved", message: "The action must be explicitly approved before completion." };
    }
    const actionType = String(rows[0].action_type) as PersonalAgentActionType;
    const verified = await evidenceRefVerified(tx, userId, actionType, input.evidence_ref);
    await tx`
      insert into rmf_personal_agent_receipts
        (run_id,action_id,user_id,receipt_type,expected,observed,verified)
      values
        (${input.run_id},${input.action_id},${userId},'completion',
         ${tx.json({ action_type: actionType, own_row_required: true } as any)},
         ${tx.json({ evidence_ref: input.evidence_ref, outcome_summary: input.outcome_summary } as any)},${verified})
    `;
    if (!verified) {
      return {
        ok: false as const,
        error: "evidence_receipt_unverified",
        message: "The completion receipt does not reference a matching own-row evidence record. The action remains approved and open."
      };
    }
    await tx`
      update rmf_personal_agent_actions
      set status='completed',completed_at=now()
      where id=${input.action_id} and run_id=${input.run_id} and user_id=${userId}
    `;
    await tx`
      update rmf_personal_agent_runs
      set status='completed',closure_state='completed',updated_at=now(),completed_at=now()
      where id=${input.run_id} and user_id=${userId}
    `;
    return { ok: true as const };
  });
  if (!result.ok) return result;
  const runs = await readPersonalAgentRuns(userId, { run_id: input.run_id });
  return { ok: true as const, operation: "complete" as const, run: runs[0] };
}
