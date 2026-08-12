import { databaseConfigured, db, ensureMemorySchema } from "./db";
import { ensurePersonalNetworkSchema, profile, updateProfile } from "./personalNetwork";

/** True when a jsonb blob has no meaningful preference/content payload. */
export function hasPreferencePayload(value: unknown): boolean {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>).filter(([key, val]) => {
    if (key === "consent_personalization" || key === "consent_history") return false;
    if (val == null || val === "") return false;
    if (typeof val === "object" && !Array.isArray(val) && Object.keys(val as object).length === 0) return false;
    return true;
  });
  return entries.length > 0;
}

/** Dual-write: legacy context → Personal Network profile (canonical store). */
export async function syncLegacyContextToPersonal(userId: string, context: Record<string, unknown>) {
  if (!databaseConfigured()) return;
  await updateProfile(userId, { ...context, consent_personalization: true });
}

/** Dual-write: Personal Network profile → legacy user context. */
export async function syncPersonalProfileToLegacy(userId: string, profileDoc: Record<string, unknown>) {
  if (!databaseConfigured()) return;
  await ensureMemorySchema();
  const sql = db();
  const consent = profileDoc.consent_personalization === true;
  await sql`
    insert into rmf_users (id, consent_personalization, updated_at)
    values (${userId}, ${consent}, now())
    on conflict (id) do update set
      consent_personalization = case when ${consent} then true else rmf_users.consent_personalization end,
      updated_at = now()
  `;
  await sql`
    insert into rmf_user_context (user_id, context, updated_at)
    values (${userId}, ${sql.json(profileDoc as any)}, now())
    on conflict (user_id) do update set context = excluded.context, updated_at = now()
  `;
}

/**
 * Canonical read for getPersonalNetwork mode=profile.
 * Falls back to legacy rmf_user_context when personal profile is missing/empty,
 * and lazily migrates that payload into the personal profile.
 */
export async function readProfileUnified(userId: string) {
  await ensurePersonalNetworkSchema();
  const row = await profile(userId);
  const personalDoc = (row?.profile || null) as Record<string, unknown> | null;
  if (hasPreferencePayload(personalDoc)) return row;

  if (!databaseConfigured()) return row;
  await ensureMemorySchema();
  const sql = db();
  const legacy = await sql`select context, updated_at from rmf_user_context where user_id=${userId} limit 1`;
  const ctx = (legacy[0]?.context || null) as Record<string, unknown> | null;
  if (!hasPreferencePayload(ctx)) return row;

  // Migrate legacy → personal so both paths agree going forward.
  await syncLegacyContextToPersonal(userId, ctx!);
  return (await profile(userId)) || { profile: { ...ctx, consent_personalization: true }, updated_at: legacy[0].updated_at };
}

/**
 * Canonical read for getUserContext.
 * Falls back to Personal Network profile when legacy context is missing/empty,
 * and lazily mirrors personal → legacy.
 */
export async function readContextUnified(userId: string) {
  await ensureMemorySchema();
  const sql = db();
  const rows = await sql`
    select u.consent_personalization, u.consent_history, c.context, c.updated_at
    from rmf_users u
    left join rmf_user_context c on c.user_id = u.id
    where u.id = ${userId}
    limit 1
  `;

  if (rows.length && hasPreferencePayload(rows[0].context)) {
    return { found: true as const, row: rows[0] };
  }

  const personal = await profile(userId);
  const personalDoc = (personal?.profile || null) as Record<string, unknown> | null;
  if (!hasPreferencePayload(personalDoc)) {
    if (!rows.length) return { found: false as const, row: null };
    return { found: true as const, row: rows[0] };
  }

  await syncPersonalProfileToLegacy(userId, personalDoc!);
  const refreshed = await sql`
    select u.consent_personalization, u.consent_history, c.context, c.updated_at
    from rmf_users u
    left join rmf_user_context c on c.user_id = u.id
    where u.id = ${userId}
    limit 1
  `;
  if (refreshed.length) return { found: true as const, row: refreshed[0] };
  return {
    found: true as const,
    row: {
      consent_personalization: personalDoc!.consent_personalization === true,
      consent_history: false,
      context: personalDoc,
      updated_at: personal?.updated_at || null
    }
  };
}

/** Privacy delete: clear both Account Learning stores. */
export async function clearAccountLearningStores(userId: string) {
  await ensureMemorySchema();
  await ensurePersonalNetworkSchema();
  const sql = db();
  await sql`delete from rmf_users where id = ${userId}`;
  await sql`delete from rmf_personal_profiles where user_id = ${userId}`;
}
