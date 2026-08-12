/**
 * Production Account Learning pipeline: meaningful writes → rmf_interactions
 * → rmf_personal_recommendations (when a product URL/title is available).
 *
 * Compare Me To Me stays DISABLED. A queued compare job with
 * source_interaction_id is created only when RMF_COMPARE_TEST_LINK=1
 * (ops/test path). /api/compare remains a 503 stub.
 */
import {
  asRecord,
  defaultInteractionSummary,
  extractRecommendationCandidate,
  firstString,
  hasPreferencePayload
} from "./accountLearningShape";
import { maybeLinkDisabledCompareJob } from "./compareJobs";
import {
  recommendationFeedback,
  saveInteraction,
  upsertRecommendationFromInteraction
} from "./personalNetwork";

export type LearningPipelineResult = {
  interaction: { id: number; created_at: unknown } | null;
  recommendation: Record<string, unknown> | null;
  compare_test_job: { id: unknown; source_interaction_id?: unknown } | null;
};

function asInteractionRow(row: unknown): { id: number; created_at: unknown } | null {
  if (!row || typeof row !== "object") return null;
  const id = Number((row as { id?: unknown }).id);
  if (!Number.isFinite(id)) return null;
  return { id, created_at: (row as { created_at?: unknown }).created_at };
}

/**
 * Persist one Account Learning write: interaction always (when meaningful),
 * recommendation when URL/title is present or the caller explicitly saved one.
 */
export async function recordLearningWrite(input: {
  userId: string;
  kind: string;
  summary?: string;
  data?: Record<string, unknown>;
  recommendation?: { item_type?: string; title?: string; url?: string; data?: Record<string, unknown> };
  feedback?: { recommendation_id: number; feedback: string };
  /** Skip empty preference patches (update_profile with no payload). */
  requireMeaningfulPreference?: boolean;
}): Promise<LearningPipelineResult> {
  const kind = String(input.kind || "chat").slice(0, 80);
  const data = asRecord(input.data);
  const explicitRec = input.recommendation;
  const extras = explicitRec
    ? { item_type: explicitRec.item_type, title: explicitRec.title, url: explicitRec.url }
    : undefined;

  if (input.requireMeaningfulPreference && kind === "preference" && !explicitRec && !input.feedback) {
    if (!hasPreferencePayload(data)) {
      return { interaction: null, recommendation: null, compare_test_job: null };
    }
  }

  let recommendation: Record<string, unknown> | null = null;
  if (input.feedback) {
    const updated = await recommendationFeedback(
      input.userId,
      input.feedback.recommendation_id,
      String(input.feedback.feedback || "").slice(0, 200)
    );
    if (updated && typeof updated === "object") recommendation = updated as Record<string, unknown>;
    data.recommendation_id = input.feedback.recommendation_id;
    data.feedback = String(input.feedback.feedback || "").slice(0, 200);
    data.feedback_applied = Boolean(updated);
  }

  const summary = defaultInteractionSummary(kind, String(input.summary || ""), {
    ...data,
    ...(explicitRec || {})
  });
  const interaction = asInteractionRow(
    await saveInteraction(input.userId, kind, summary, data)
  );

  const candidate =
    extractRecommendationCandidate(explicitRec ? { ...asRecord(explicitRec.data), ...explicitRec } : data, extras) ||
    (explicitRec
      ? {
          item_type: String(explicitRec.item_type || "product").slice(0, 80),
          title: firstString(explicitRec.title),
          url: firstString(explicitRec.url),
          data: asRecord(explicitRec.data)
        }
      : null);

  if (interaction && candidate && !input.feedback) {
    const saved = await upsertRecommendationFromInteraction(input.userId, {
      item_type: candidate.item_type,
      title: candidate.title || undefined,
      url: candidate.url || undefined,
      data: { ...candidate.data, source_kind: kind },
      source_interaction_id: interaction.id
    });
    if (saved && typeof saved === "object") recommendation = saved as Record<string, unknown>;
  }

  let compare_test_job: LearningPipelineResult["compare_test_job"] = null;
  if (interaction) {
    const linked = await maybeLinkDisabledCompareJob(input.userId, interaction.id);
    if (linked.linked) compare_test_job = linked.job;
  }

  console.info("[account-learning:pipeline]", {
    kind,
    interaction_id: interaction?.id ?? null,
    recommendation_id: recommendation?.id ?? null,
    compare_test_linked: Boolean(compare_test_job)
  });

  return { interaction, recommendation, compare_test_job };
}
