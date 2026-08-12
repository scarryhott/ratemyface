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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed.slice(0, 2000);
  }
  return null;
}

/**
 * Pull a product-like recommendation candidate from a write payload.
 * Preference-only blobs (no URL/title) return null — do not invent products.
 */
export function extractRecommendationCandidate(
  payload: Record<string, unknown> | null | undefined,
  extras?: { item_type?: unknown; title?: unknown; url?: unknown }
): { item_type: string; title: string | null; url: string | null; data: Record<string, unknown> } | null {
  const src = asRecord(payload);
  const nestedProduct = asRecord(src.product);
  const nestedRec = asRecord(src.recommendation);
  const nested = Object.keys(nestedProduct).length ? nestedProduct : nestedRec;

  const url = firstString(
    extras?.url,
    src.url,
    src.affiliate_url,
    src.product_url,
    nested.url,
    nested.affiliate_url
  );
  const title = firstString(extras?.title, src.title, nested.title);
  if (!url && !title) return null;

  const itemType =
    firstString(extras?.item_type, src.item_type, nested.item_type) || "product";
  return {
    item_type: itemType.slice(0, 80),
    title: title ? title.slice(0, 300) : null,
    url: url ? url.slice(0, 2000) : null,
    data: { ...nested, ...src }
  };
}

export function defaultInteractionSummary(
  kind: string,
  summary: string,
  data: Record<string, unknown>
): string {
  const trimmed = String(summary || "").trim().slice(0, 1000);
  if (trimmed) return trimmed;
  if (kind === "preference") return "Updated personal preferences";
  if (kind === "recommendation") {
    return firstString(data.title, data.url) || "Saved a product recommendation";
  }
  if (kind === "feedback") return "Recorded recommendation feedback";
  return "Account learning event";
}

export { firstString, asRecord };
