/** Pure helpers for Account Learning preference payloads (no DB). */

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

export type PersonalProfileRow = { profile?: unknown; updated_at?: unknown } | null;

/**
 * Normalize getPersonalNetwork mode=profile payloads so the model sees a clear
 * found/empty contract instead of ambiguous `data: null` vs `{preferences:{}}`.
 */
export function shapePersonalProfilePayload(row: PersonalProfileRow) {
  const raw = row?.profile;
  const profileDoc =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const found = hasPreferencePayload(raw ?? null);
  const nestedPrefs = profileDoc.preferences;
  const preferences =
    nestedPrefs && typeof nestedPrefs === "object" && !Array.isArray(nestedPrefs)
      ? (nestedPrefs as Record<string, unknown>)
      : {};

  if (!found) {
    return {
      found: false,
      empty: true,
      preferences: {},
      profile: { preferences: {} },
      updated_at: row?.updated_at ?? null,
      message: "No stored Rate My Face preferences yet. Do not invent prefs from chat or web search."
    };
  }

  return {
    found: true,
    empty: false,
    preferences,
    profile: profileDoc,
    updated_at: row?.updated_at ?? null
  };
}
