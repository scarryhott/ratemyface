/**
 * Pure Compare Me To Me TEST analysis helpers (no DB).
 * Honest history-placeholder recap — no live product, vision, or medical claims.
 */

export type CompareLearningSnapshot = {
  profile: Record<string, unknown> | null;
  latest_interaction: {
    id: number;
    kind: string;
    summary: string;
    data: Record<string, unknown>;
    created_at: unknown;
  } | null;
  latest_recommendation: {
    id: number;
    item_type: string;
    title: string | null;
    url: string | null;
    created_at: unknown;
  } | null;
};

export type HonestCompareTestResult = {
  summary: string;
  score: Record<string, unknown>;
  data: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Structured placeholder analysis from stored prefs/history.
 * Does not invent a live product, ASIN, medical claim, or photo score.
 */
export function buildHonestCompareTestResult(snapshot: CompareLearningSnapshot): HonestCompareTestResult {
  const prefs = asRecord(snapshot.profile?.preferences);
  const preferenceKeys = Object.keys(prefs);
  const profileKeys = snapshot.profile
    ? Object.keys(snapshot.profile).filter((k) => k !== "preferences")
    : [];
  const hasHistory = Boolean(
    snapshot.profile || snapshot.latest_interaction || snapshot.latest_recommendation
  );

  return {
    summary:
      "Authenticated Compare Me To Me TEST recap from stored Account Learning history. No live photo analysis, no new product, and no medical claims.",
    score: {
      mode: "history_placeholder",
      live_vision: false,
      live_product: false,
      medical_claims: false,
      public_feature_enabled: false,
      history_present: hasHistory
    },
    data: {
      test_path: true,
      live_vision: false,
      live_product: false,
      medical_claims: false,
      public_feature_enabled: false,
      image_mode: "placeholder_refs",
      preference_keys: preferenceKeys,
      profile_keys: profileKeys,
      latest_interaction: snapshot.latest_interaction
        ? {
            id: snapshot.latest_interaction.id,
            kind: snapshot.latest_interaction.kind,
            summary: snapshot.latest_interaction.summary.slice(0, 300)
          }
        : null,
      latest_saved_item: snapshot.latest_recommendation
        ? {
            id: snapshot.latest_recommendation.id,
            item_type: snapshot.latest_recommendation.item_type,
            title: snapshot.latest_recommendation.title,
            previously_saved: true,
            generated_by_compare: false
          }
        : null,
      note: "Placeholder analysis of already-persisted prefs/history. Not a LIVE appearance rating and not a product recommendation."
    }
  };
}
