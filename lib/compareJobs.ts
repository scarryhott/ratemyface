/**
 * Compare Me To Me writers.
 *
 * Public /api/compare* stay 503 stubs. Two server-only helpers:
 * 1. maybeLinkDisabledCompareJob — opt-in RMF_COMPARE_TEST_LINK=1 queued row
 *    on Account Learning writes (source_interaction_id wiring).
 * 2. runAuthenticatedCompareTest — OAuth/owner/operator TEST path: queued →
 *    running → completed/failed, honest history placeholder result, follow-up
 *    interaction + context note. Does not flip COMPARE_ME_TO_ME.enabled.
 */
import { asRecord, firstString } from "./accountLearningShape";
import {
  COMPARE_ME_TO_ME,
  COMPARE_TEST_ACTION,
  COMPARE_TEST_ACTION_COST,
  compareTestLinkEnabled
} from "./compareFeature";
import { databaseConfigured, db } from "./db";
import {
  history,
  profile,
  saveInteraction,
  saveRecommendation,
  savedItems
} from "./personalNetwork";
import {
  buildHonestCompareTestResult,
  type CompareLearningSnapshot
} from "./compareTestShape";

export {
  COMPARE_TEST_ACTION,
  COMPARE_TEST_ACTION_COST,
  compareTestLinkEnabled
} from "./compareFeature";
export { buildHonestCompareTestResult } from "./compareTestShape";
export type { CompareLearningSnapshot, HonestCompareTestResult } from "./compareTestShape";

export type CompareTestLinkResult =
  | { linked: false; reason: string }
  | { linked: true; job: { id: unknown; source_interaction_id?: unknown; status?: unknown } };

export type CompareTestRunResult =
  | {
      ok: true;
      job: {
        id: number;
        status: string;
        source_interaction_id: number | null;
        consent_compare: boolean;
        consent_image_storage: boolean;
        before_image_ref: string | null;
        after_image_ref: string | null;
      };
      result: { id: number; job_id: number; summary: string; score: unknown; data: unknown };
      follow_up: {
        interaction: { id: number; created_at: unknown } | null;
        recommendation: Record<string, unknown> | null;
      };
      snapshot: {
        has_profile: boolean;
        has_interaction: boolean;
        has_recommendation: boolean;
      };
      credits: { action: string; cost: number };
    }
  | {
      ok: false;
      error: string;
      message: string;
      job?: { id: number; status: string; error?: string | null };
    };

async function compareTablesReady(): Promise<boolean> {
  if (!databaseConfigured()) return false;
  const sql = db();
  const jobs = await sql`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'rmf_compare_jobs'
    limit 1
  `;
  const results = await sql`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'rmf_compare_results'
    limit 1
  `;
  return jobs.length > 0 && results.length > 0;
}

function asId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function readCompareLearningSnapshot(userId: string): Promise<CompareLearningSnapshot> {
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
    | {
        id?: unknown;
        item_type?: unknown;
        title?: unknown;
        url?: unknown;
        created_at?: unknown;
      }
    | null;

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
            url: recRow.url != null ? String(recRow.url) : null,
            created_at: recRow.created_at
          }
        : null
  };
}

/**
 * Structured placeholder analysis lives in compareTestShape.ts.
 */
function placeholderImageRefs(
  snapshot: CompareLearningSnapshot
): { before_image_ref: string; after_image_ref: string; used_stored_refs: boolean } {
  const doc = snapshot.profile || {};
  const interactionId = snapshot.latest_interaction?.id;
  const before =
    firstString(doc.before_image_ref, doc.image_ref, doc.photo_ref) ||
    `placeholder://account-learning/before${interactionId ? `/interaction/${interactionId}` : ""}`;
  const after =
    firstString(doc.after_image_ref) ||
    `placeholder://account-learning/after${interactionId ? `/interaction/${interactionId}` : ""}`;
  const used_stored_refs = Boolean(
    firstString(doc.before_image_ref, doc.image_ref, doc.photo_ref, doc.after_image_ref)
  );
  return { before_image_ref: before, after_image_ref: after, used_stored_refs };
}

export async function maybeLinkDisabledCompareJob(
  userId: string,
  sourceInteractionId: number
): Promise<CompareTestLinkResult> {
  if (COMPARE_ME_TO_ME.enabled) {
    return { linked: false, reason: "live_compare_not_this_path" };
  }
  if (!compareTestLinkEnabled()) {
    return { linked: false, reason: "compare_disabled" };
  }
  if (!databaseConfigured()) {
    return { linked: false, reason: "database_not_configured" };
  }
  if (!Number.isFinite(sourceInteractionId)) {
    return { linked: false, reason: "invalid_interaction_id" };
  }

  const sql = db();
  const exists = await sql`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'rmf_compare_jobs'
    limit 1
  `;
  if (!exists.length) {
    return { linked: false, reason: "compare_schema_missing" };
  }

  const rows = await sql`
    insert into rmf_compare_jobs (
      user_id, status, source_interaction_id, consent_compare, consent_image_storage, metadata
    )
    values (
      ${userId},
      'queued',
      ${sourceInteractionId},
      false,
      false,
      ${sql.json({ disabled_test_path: true, enabled: false })}
    )
    returning id, status, source_interaction_id
  `;
  const row = rows[0] as { id?: unknown; status?: unknown; source_interaction_id?: unknown } | undefined;
  if (row?.id == null) {
    return { linked: false, reason: "insert_failed" };
  }
  return {
    linked: true,
    job: {
      id: row.id,
      status: row.status,
      source_interaction_id: row.source_interaction_id
    }
  };
}

/**
 * Authenticated, non-public Compare Me To Me TEST:
 * existing Account Learning history → job (queued→running→completed|failed)
 * → honest placeholder result → follow-up interaction + context note.
 */
export async function runAuthenticatedCompareTest(
  userId: string,
  options: { consent_compare?: boolean; consent_image_storage?: boolean } = {}
): Promise<CompareTestRunResult> {
  if (COMPARE_ME_TO_ME.enabled) {
    return {
      ok: false,
      error: "live_compare_not_this_path",
      message: "Live Compare Me To Me is not this test path."
    };
  }
  if (!databaseConfigured()) {
    return {
      ok: false,
      error: "database_not_configured",
      message: "Database is not configured."
    };
  }
  if (!(await compareTablesReady())) {
    return {
      ok: false,
      error: "compare_schema_missing",
      message: "rmf_compare_jobs / rmf_compare_results are not applied."
    };
  }

  const snapshot = await readCompareLearningSnapshot(userId);
  if (!snapshot.profile && !snapshot.latest_interaction && !snapshot.latest_recommendation) {
    return {
      ok: false,
      error: "no_account_learning_history",
      message: "No stored profile, interaction, or recommendation to compare from."
    };
  }

  const consentCompare = options.consent_compare !== false;
  const consentImageStorage = options.consent_image_storage === true;
  const refs = placeholderImageRefs(snapshot);
  const sourceInteractionId = snapshot.latest_interaction?.id ?? null;
  const sql = db();

  const inserted = await sql`
    insert into rmf_compare_jobs (
      user_id, status, source_interaction_id, before_image_ref, after_image_ref,
      consent_compare, consent_image_storage, metadata
    )
    values (
      ${userId},
      'queued',
      ${sourceInteractionId},
      ${refs.before_image_ref},
      ${refs.after_image_ref},
      ${consentCompare},
      ${consentImageStorage},
      ${sql.json({
        authenticated_test_path: true,
        enabled: false,
        used_stored_image_refs: refs.used_stored_refs,
        public_feature: false
      } as any)}
    )
    returning id, status, source_interaction_id, consent_compare, consent_image_storage,
      before_image_ref, after_image_ref
  `;
  const jobRow = inserted[0] as { id?: unknown } | undefined;
  const jobId = asId(jobRow?.id);
  if (jobId == null) {
    return { ok: false, error: "insert_failed", message: "Failed to insert compare job." };
  }

  try {
    await sql`
      update rmf_compare_jobs
      set status = 'running', started_at = now(), updated_at = now()
      where id = ${jobId} and user_id = ${userId}
    `;

    const honest = buildHonestCompareTestResult(snapshot);
    const resultRows = await sql`
      insert into rmf_compare_results (job_id, user_id, summary, score, data)
      values (
        ${jobId},
        ${userId},
        ${honest.summary},
        ${sql.json(honest.score as any)},
        ${sql.json(honest.data as any)}
      )
      returning id, job_id, summary, score, data
    `;
    const resultRow = resultRows[0] as { id?: unknown; job_id?: unknown; summary?: unknown; score?: unknown; data?: unknown };
    const resultId = asId(resultRow?.id);
    if (resultId == null) throw new Error("result_insert_failed");

    await sql`
      update rmf_compare_jobs
      set status = 'completed', completed_at = now(), updated_at = now(), error = null
      where id = ${jobId} and user_id = ${userId}
    `;

    const interaction = await saveInteraction(
      userId,
      "compare_test",
      "Authenticated Compare Me To Me test completed from stored Account Learning history",
      {
        compare_job_id: jobId,
        compare_result_id: resultId,
        source_interaction_id: sourceInteractionId,
        live_product: false,
        medical_claims: false,
        live_vision: false,
        public_feature_enabled: false
      }
    );
    const interactionId = asId((interaction as { id?: unknown } | undefined)?.id);

    const recommendation = await saveRecommendation(userId, {
      item_type: "context",
      title: "Compare Me To Me test completed",
      data: {
        compare_job_id: jobId,
        compare_result_id: resultId,
        live_product: false,
        medical_claims: false,
        public_feature_enabled: false,
        note: "Context note that an authenticated compare test ran. Not a product recommendation."
      },
      source_interaction_id: interactionId ?? undefined
    });

    console.info("[compare:authenticated-test]", {
      user_id: userId,
      job_id: jobId,
      result_id: resultId,
      follow_up_interaction_id: interactionId,
      follow_up_recommendation_id: (recommendation as { id?: unknown } | undefined)?.id ?? null
    });

    return {
      ok: true,
      job: {
        id: jobId,
        status: "completed",
        source_interaction_id: sourceInteractionId,
        consent_compare: consentCompare,
        consent_image_storage: consentImageStorage,
        before_image_ref: refs.before_image_ref,
        after_image_ref: refs.after_image_ref
      },
      result: {
        id: resultId,
        job_id: asId(resultRow.job_id) ?? jobId,
        summary: String(resultRow.summary || honest.summary),
        score: resultRow.score,
        data: resultRow.data
      },
      follow_up: {
        interaction: interactionId != null
          ? { id: interactionId, created_at: (interaction as { created_at?: unknown }).created_at }
          : null,
        recommendation: recommendation && typeof recommendation === "object"
          ? (recommendation as Record<string, unknown>)
          : null
      },
      snapshot: {
        has_profile: Boolean(snapshot.profile),
        has_interaction: Boolean(snapshot.latest_interaction),
        has_recommendation: Boolean(snapshot.latest_recommendation)
      },
      credits: { action: COMPARE_TEST_ACTION, cost: COMPARE_TEST_ACTION_COST }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`
      update rmf_compare_jobs
      set status = 'failed', error = ${message.slice(0, 500)}, completed_at = now(), updated_at = now()
      where id = ${jobId} and user_id = ${userId}
    `;
    return {
      ok: false,
      error: "compare_test_failed",
      message,
      job: { id: jobId, status: "failed", error: message.slice(0, 500) }
    };
  }
}
