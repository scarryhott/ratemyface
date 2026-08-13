/**
 * Appearance Agent writers.
 *
 * runAuthenticatedAppearancePlan — paid OpenAPI Action: 90-day plan from
 *   Account Learning + Compare history (fails if required history is missing).
 * runAuthenticatedAppearanceCheckin — paid OpenAPI Action: honest check-in
 *   against an existing plan.
 */
import { asRecord } from "./accountLearningShape";
import {
  APPEARANCE_ACTION_COST,
  APPEARANCE_AGENT,
  APPEARANCE_CHECKIN_ACTION,
  APPEARANCE_PLAN_ACTION,
  appearanceDayIndex,
  buildHonestAppearanceCheckin,
  buildHonestAppearancePlan,
  requiredAppearanceHistory,
  type AppearanceHistorySnapshot,
  type AppearancePlanRow
} from "./appearanceAgent";
import { isUsableImageRef } from "./compareVision";
import { databaseConfigured, db } from "./db";
import {
  history,
  profile,
  saveInteraction,
  saveRecommendation,
  savedItems
} from "./personalNetwork";

export {
  APPEARANCE_ACTION_COST,
  APPEARANCE_CHECKIN_ACTION,
  APPEARANCE_PLAN_ACTION
} from "./appearanceAgent";
export type { AppearanceHistorySnapshot } from "./appearanceAgent";

export type AppearancePlanPayload = AppearancePlanRow & {
  baseline_profile_note: string | null;
  metadata: unknown;
};

export type AppearanceCheckinPayload = {
  id: number;
  plan_id: number;
  day_index: number;
  summary: string;
  recommendation_id: number | null;
  interaction_id: number | null;
  compare_job_id: number | null;
};

export type AppearanceActionRunResult =
  | {
      ok: true;
      operation: "create_plan" | "checkin";
      reused_existing?: boolean;
      plan: AppearancePlanPayload;
      checkin?: AppearanceCheckinPayload;
      honest: ReturnType<typeof buildHonestAppearancePlan> | ReturnType<typeof buildHonestAppearanceCheckin>;
      follow_up: {
        interaction: { id: number; created_at: unknown } | null;
        recommendation: Record<string, unknown> | null;
      };
      snapshot: {
        has_profile: boolean;
        has_interaction: boolean;
        has_recommendation: boolean;
        has_compare: boolean;
      };
      credits: { action: string; cost: number };
    }
  | {
      ok: false;
      error: string;
      message: string;
      plan?: { id: number; status: string };
    };

function asId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function appearanceTablesReady(): Promise<boolean> {
  if (!databaseConfigured()) return false;
  const sql = db();
  const plans = await sql`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'rmf_appearance_plans'
    limit 1
  `;
  const checkins = await sql`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'rmf_appearance_checkins'
    limit 1
  `;
  return plans.length > 0 && checkins.length > 0;
}

function asPlanRow(row: Record<string, unknown> | undefined | null): AppearancePlanRow | null {
  if (!row) return null;
  const id = asId(row.id);
  if (id == null) return null;
  return {
    id,
    goal: String(row.goal || "professional image"),
    status: String(row.status || "draft"),
    day_index: asId(row.day_index) ?? 0,
    target_days: asId(row.target_days) ?? APPEARANCE_AGENT.target_days,
    started_at: row.started_at ?? null,
    created_at: row.created_at ?? null,
    baseline_interaction_id: asId(row.baseline_interaction_id),
    baseline_image_ref: row.baseline_image_ref != null ? String(row.baseline_image_ref) : null
  };
}

function asPlanPayload(row: Record<string, unknown>): AppearancePlanPayload {
  const plan = asPlanRow(row);
  if (!plan) throw new Error("plan_row_invalid");
  return {
    ...plan,
    baseline_profile_note: row.baseline_profile_note != null ? String(row.baseline_profile_note) : null,
    metadata: row.metadata ?? {}
  };
}

export async function readAppearanceHistorySnapshot(userId: string): Promise<AppearanceHistorySnapshot> {
  const [profileRow, interactions, recs] = await Promise.all([
    profile(userId),
    history(userId, 1),
    savedItems(userId, 1)
  ]);
  const profileDoc = asRecord((profileRow as { profile?: unknown } | null)?.profile);
  const interactionRow = (interactions?.[0] || null) as
    | { id?: unknown; kind?: unknown; summary?: unknown; data?: unknown; created_at?: unknown }
    | null;
  const recRow = (recs?.[0] || null) as
    | { id?: unknown; item_type?: unknown; title?: unknown; created_at?: unknown }
    | null;

  let latest_compare: AppearanceHistorySnapshot["latest_compare"] = null;
  let active_plan: AppearancePlanRow | null = null;
  const sql = db();

  try {
    const compareRows = await sql`
      select j.id, j.status, j.completed_at, r.summary
      from rmf_compare_jobs j
      left join rmf_compare_results r on r.job_id = j.id and r.user_id = j.user_id
      where j.user_id = ${userId}
      order by j.created_at desc
      limit 1
    `;
    const compare = compareRows[0] as
      | { id?: unknown; status?: unknown; completed_at?: unknown; summary?: unknown }
      | undefined;
    const jobId = asId(compare?.id);
    if (jobId != null) {
      latest_compare = {
        job_id: jobId,
        status: String(compare?.status || ""),
        summary: compare?.summary != null ? String(compare.summary) : null,
        completed_at: compare?.completed_at ?? null
      };
    }
  } catch {
    latest_compare = null;
  }

  try {
    const planRows = await sql`
      select id, goal, status, day_index, target_days, started_at, created_at,
        baseline_interaction_id, baseline_image_ref
      from rmf_appearance_plans
      where user_id = ${userId} and status in ('active', 'draft')
      order by created_at desc
      limit 1
    `;
    active_plan = asPlanRow(planRows[0] as Record<string, unknown> | undefined);
  } catch {
    active_plan = null;
  }

  const interactionId = interactionRow ? asId(interactionRow.id) : null;
  return {
    profile: Object.keys(profileDoc).length ? profileDoc : null,
    latest_interaction:
      interactionRow && interactionId != null
        ? {
            id: interactionId,
            kind: String(interactionRow.kind || ""),
            summary: String(interactionRow.summary || ""),
            data: asRecord(interactionRow.data),
            created_at: interactionRow.created_at
          }
        : null,
    latest_recommendation:
      recRow && asId(recRow.id) != null
        ? {
            id: asId(recRow.id) as number,
            item_type: String(recRow.item_type || ""),
            title: recRow.title != null ? String(recRow.title) : null,
            created_at: recRow.created_at
          }
        : null,
    latest_compare,
    active_plan
  };
}

export async function listAppearancePlans(userId: string, limit = 10): Promise<{
  plans: AppearancePlanPayload[];
  checkins: AppearanceCheckinPayload[];
}> {
  const sql = db();
  const planRows = await sql`
    select id, goal, status, day_index, target_days, started_at, created_at,
      baseline_interaction_id, baseline_image_ref, baseline_profile_note, metadata
    from rmf_appearance_plans
    where user_id = ${userId}
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 20)}
  `;
  const checkinRows = await sql`
    select id, plan_id, day_index, summary, recommendation_id, interaction_id, compare_job_id
    from rmf_appearance_checkins
    where user_id = ${userId}
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 20)}
  `;
  return {
    plans: (planRows as Record<string, unknown>[]).map(asPlanPayload),
    checkins: (checkinRows as Record<string, unknown>[]).map((row) => ({
      id: asId(row.id) as number,
      plan_id: asId(row.plan_id) as number,
      day_index: asId(row.day_index) ?? 0,
      summary: String(row.summary || ""),
      recommendation_id: asId(row.recommendation_id),
      interaction_id: asId(row.interaction_id),
      compare_job_id: asId(row.compare_job_id)
    }))
  };
}

function snapshotFlags(snapshot: AppearanceHistorySnapshot) {
  return {
    has_profile: Boolean(snapshot.profile),
    has_interaction: Boolean(snapshot.latest_interaction),
    has_recommendation: Boolean(snapshot.latest_recommendation),
    has_compare: Boolean(snapshot.latest_compare)
  };
}

function baselineImageRef(snapshot: AppearanceHistorySnapshot): string | null {
  const doc = snapshot.profile || {};
  const ref = firstUsableRef(doc.baseline_image_ref, doc.before_image_ref, doc.image_ref, doc.photo_ref);
  return ref;
}

function firstUsableRef(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && isUsableImageRef(value)) return value.slice(0, 2000);
  }
  return null;
}

/**
 * Paid appearancePlan Action. Caller must already have validated OAuth,
 * credits, and explicit consent_appearance=true.
 */
export async function runAuthenticatedAppearancePlan(
  userId: string,
  options: { goal?: unknown } = {}
): Promise<AppearanceActionRunResult> {
  if (!databaseConfigured()) {
    return { ok: false, error: "database_not_configured", message: "Database is not configured." };
  }
  if (!(await appearanceTablesReady())) {
    return {
      ok: false,
      error: "appearance_schema_missing",
      message: "rmf_appearance_plans / rmf_appearance_checkins are not applied."
    };
  }

  const snapshot = await readAppearanceHistorySnapshot(userId);
  if (snapshot.active_plan) {
    const sql = db();
    const rows = await sql`
      select id, goal, status, day_index, target_days, started_at, created_at,
        baseline_interaction_id, baseline_image_ref, baseline_profile_note, metadata
      from rmf_appearance_plans
      where id = ${snapshot.active_plan.id} and user_id = ${userId}
      limit 1
    `;
    const row = rows[0] as Record<string, unknown> | undefined;
    if (row) {
      const honest = buildHonestAppearancePlan(snapshot, row.goal);
      return {
        ok: true,
        operation: "create_plan",
        reused_existing: true,
        plan: asPlanPayload(row),
        honest,
        follow_up: { interaction: null, recommendation: null },
        snapshot: snapshotFlags(snapshot),
        credits: { action: APPEARANCE_PLAN_ACTION, cost: APPEARANCE_ACTION_COST }
      };
    }
  }

  const historyOk = requiredAppearanceHistory(snapshot);
  if (!historyOk.ok) {
    return { ok: false, error: historyOk.error, message: historyOk.message };
  }

  const honest = buildHonestAppearancePlan(snapshot, options.goal);
  const sql = db();
  const inserted = await sql`
    insert into rmf_appearance_plans (
      user_id, goal, status, day_index, target_days,
      baseline_image_ref, baseline_interaction_id, baseline_profile_note, metadata,
      started_at
    )
    values (
      ${userId},
      ${honest.goal},
      'active',
      0,
      ${APPEARANCE_AGENT.target_days},
      ${baselineImageRef(snapshot)},
      ${snapshot.latest_interaction?.id ?? null},
      ${`Stored preference keys: ${((honest.data.preference_keys as string[]) || []).join(", ") || "none"}`.slice(0, 500)},
      ${sql.json({
        action: APPEARANCE_PLAN_ACTION,
        live_coaching: false,
        medical_claims: false,
        invented_advice: false,
        compare_job_id: snapshot.latest_compare?.job_id ?? null
      } as any)},
      now()
    )
    returning id, goal, status, day_index, target_days, started_at, created_at,
      baseline_interaction_id, baseline_image_ref, baseline_profile_note, metadata
  `;
  const planRow = inserted[0] as Record<string, unknown> | undefined;
  if (!planRow || asId(planRow.id) == null) {
    return { ok: false, error: "insert_failed", message: "Failed to insert appearance plan." };
  }
  const plan = asPlanPayload(planRow);

  const interaction = await saveInteraction(
    userId,
    "appearance_plan",
    "Appearance 90-day professional-image plan recorded from stored history",
    {
      appearance_plan_id: plan.id,
      live_coaching: false,
      medical_claims: false,
      live_product: false,
      public_unauthenticated: false
    }
  );
  const interactionId = asId((interaction as { id?: unknown } | undefined)?.id);
  const recommendation = await saveRecommendation(userId, {
    item_type: "context",
    title: "Appearance plan recorded",
    data: {
      appearance_plan_id: plan.id,
      live_coaching: false,
      medical_claims: false,
      live_product: false,
      note: "Context note that a paid appearance plan was recorded. Not a product recommendation."
    },
    source_interaction_id: interactionId ?? undefined
  });

  console.info("[appearance:plan]", { user_id: userId, plan_id: plan.id });

  return {
    ok: true,
    operation: "create_plan",
    reused_existing: false,
    plan,
    honest,
    follow_up: {
      interaction:
        interactionId != null
          ? { id: interactionId, created_at: (interaction as { created_at?: unknown }).created_at }
          : null,
      recommendation:
        recommendation && typeof recommendation === "object"
          ? (recommendation as Record<string, unknown>)
          : null
    },
    snapshot: snapshotFlags(snapshot),
    credits: { action: APPEARANCE_PLAN_ACTION, cost: APPEARANCE_ACTION_COST }
  };
}

/**
 * Paid appearanceCheckin Action. Caller must already have validated OAuth,
 * credits, and explicit consent_appearance=true.
 */
export async function runAuthenticatedAppearanceCheckin(
  userId: string,
  options: { plan_id?: unknown } = {}
): Promise<AppearanceActionRunResult> {
  if (!databaseConfigured()) {
    return { ok: false, error: "database_not_configured", message: "Database is not configured." };
  }
  if (!(await appearanceTablesReady())) {
    return {
      ok: false,
      error: "appearance_schema_missing",
      message: "rmf_appearance_plans / rmf_appearance_checkins are not applied."
    };
  }

  const snapshot = await readAppearanceHistorySnapshot(userId);
  const historyOk = requiredAppearanceHistory(snapshot);
  if (!historyOk.ok) {
    return { ok: false, error: historyOk.error, message: historyOk.message };
  }

  const requestedId = asId(options.plan_id);
  let plan = snapshot.active_plan;
  const sql = db();
  if (requestedId != null) {
    const rows = await sql`
      select id, goal, status, day_index, target_days, started_at, created_at,
        baseline_interaction_id, baseline_image_ref, baseline_profile_note, metadata
      from rmf_appearance_plans
      where id = ${requestedId} and user_id = ${userId}
      limit 1
    `;
    plan = asPlanRow(rows[0] as Record<string, unknown> | undefined);
  }
  if (!plan) {
    return {
      ok: false,
      error: "appearance_plan_required",
      message: "No appearance plan on this account. Call appearancePlan first. Nothing was invented."
    };
  }

  const honest = buildHonestAppearanceCheckin(snapshot, plan);
  const nextStatus = honest.day_index >= APPEARANCE_AGENT.target_days ? "completed" : "active";

  const inserted = await sql`
    insert into rmf_appearance_checkins (
      plan_id, user_id, day_index, summary,
      recommendation_id, interaction_id, compare_job_id, data
    )
    values (
      ${plan.id},
      ${userId},
      ${honest.day_index},
      ${honest.summary},
      ${snapshot.latest_recommendation?.id ?? null},
      ${snapshot.latest_interaction?.id ?? null},
      ${snapshot.latest_compare?.job_id ?? null},
      ${sql.json(honest.data as any)}
    )
    returning id, plan_id, day_index, summary, recommendation_id, interaction_id, compare_job_id
  `;
  const checkinRow = inserted[0] as Record<string, unknown> | undefined;
  const checkinId = asId(checkinRow?.id);
  if (checkinId == null) {
    return { ok: false, error: "insert_failed", message: "Failed to insert appearance check-in." };
  }

  await sql`
    update rmf_appearance_plans
    set day_index = ${honest.day_index},
        status = ${nextStatus},
        updated_at = now(),
        completed_at = case when ${nextStatus} = 'completed' then now() else completed_at end
    where id = ${plan.id} and user_id = ${userId}
  `;

  const planRows = await sql`
    select id, goal, status, day_index, target_days, started_at, created_at,
      baseline_interaction_id, baseline_image_ref, baseline_profile_note, metadata
    from rmf_appearance_plans
    where id = ${plan.id} and user_id = ${userId}
    limit 1
  `;
  const planPayload = asPlanPayload(planRows[0] as Record<string, unknown>);

  const interaction = await saveInteraction(
    userId,
    "appearance_checkin",
    `Appearance check-in recorded at day ${honest.day_index} of ${APPEARANCE_AGENT.target_days}`,
    {
      appearance_plan_id: plan.id,
      appearance_checkin_id: checkinId,
      day_index: honest.day_index,
      live_coaching: false,
      medical_claims: false,
      live_product: false,
      public_unauthenticated: false
    }
  );
  const interactionId = asId((interaction as { id?: unknown } | undefined)?.id);
  const recommendation = await saveRecommendation(userId, {
    item_type: "context",
    title: "Appearance check-in recorded",
    data: {
      appearance_plan_id: plan.id,
      appearance_checkin_id: checkinId,
      live_coaching: false,
      medical_claims: false,
      live_product: false,
      note: "Context note that a paid appearance check-in ran. Not a product recommendation."
    },
    source_interaction_id: interactionId ?? undefined
  });

  console.info("[appearance:checkin]", {
    user_id: userId,
    plan_id: plan.id,
    checkin_id: checkinId,
    day_index: honest.day_index
  });

  return {
    ok: true,
    operation: "checkin",
    plan: planPayload,
    checkin: {
      id: checkinId,
      plan_id: asId(checkinRow?.plan_id) ?? plan.id,
      day_index: asId(checkinRow?.day_index) ?? honest.day_index,
      summary: String(checkinRow?.summary || honest.summary),
      recommendation_id: asId(checkinRow?.recommendation_id),
      interaction_id: asId(checkinRow?.interaction_id),
      compare_job_id: asId(checkinRow?.compare_job_id)
    },
    honest,
    follow_up: {
      interaction:
        interactionId != null
          ? { id: interactionId, created_at: (interaction as { created_at?: unknown }).created_at }
          : null,
      recommendation:
        recommendation && typeof recommendation === "object"
          ? (recommendation as Record<string, unknown>)
          : null
    },
    snapshot: snapshotFlags(snapshot),
    credits: { action: APPEARANCE_CHECKIN_ACTION, cost: APPEARANCE_ACTION_COST }
  };
}
