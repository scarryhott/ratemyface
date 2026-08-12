/**
 * Disabled Compare Me To Me test-link helper.
 *
 * Public /api/compare* stay 503 stubs. This insert is opt-in via
 * RMF_COMPARE_TEST_LINK=1 so ops can prove source_interaction_id wiring
 * without flipping COMPARE_ME_TO_ME.enabled.
 */
import { COMPARE_ME_TO_ME, compareTestLinkEnabled } from "./compareFeature";
import { databaseConfigured, db } from "./db";

export { compareTestLinkEnabled } from "./compareFeature";

export type CompareTestLinkResult =
  | { linked: false; reason: string }
  | { linked: true; job: { id: unknown; source_interaction_id?: unknown; status?: unknown } };

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
