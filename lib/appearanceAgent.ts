/**
 * Appearance Agent — paid authenticated OpenAPI Actions.
 *
 * Unauthenticated / anonymous appearance is not a product (401 on /api/appearance*).
 * Plans and check-ins recap Account Learning + Compare history when present and
 * fail honestly if required history is missing. Do not claim LIVE unlimited coaching.
 * Social scraping stays off. Cost is PERSONAL_ACTION_COST (1).
 */

import { asRecord, firstString, hasPreferencePayload } from "./accountLearningShape";
import { looksMedical } from "./compareVision";

export const APPEARANCE_AGENT = {
  enabled: true as const,
  /** Health / OpenAPI-facing status. Paid Action, not a LIVE marketing claim. */
  status: "paid" as const,
  /** Operator dashboard status badge — PAID, not LIVE. */
  dashboard_status: "PAID" as const,
  note: "Paid appearancePlan / appearanceCheckin Actions (OAuth + 1 credit, same unit as Personal Network and Compare). Honest 90-day professional-image plan/check-ins from Account Learning + Compare history. Missing required history returns 400 — never invented coaching or medical claims. Not a free public product and not a LIVE unlimited-coaching claim.",
  gate: "Paid OpenAPI Actions at POST /api/appearance (appearancePlan) and POST /api/appearance/plans (appearanceCheckin). Unauthenticated callers get 401. Requires consent_appearance=true and Account Learning + Compare history (4xx if missing). Cost is PERSONAL_ACTION_COST (1). Social stays not_configured.",
  tables: ["rmf_appearance_plans", "rmf_appearance_checkins"] as const,
  action_path: "/api/appearance" as const,
  checkin_path: "/api/appearance/plans" as const,
  target_days: 90 as const,
  depends_on: ["account_learning", "compare_me_to_me"] as const,
  disabled_http: {
    ok: false as const,
    error: "appearance_not_public" as const,
    message:
      "Public appearance listing is not available. Use the authenticated appearancePlan / appearanceCheckin Actions."
  }
};

/** Same Stripe credit unit as Personal Network (`PERSONAL_ACTION_COST`) — do not invent an appearance surcharge. */
export const APPEARANCE_ACTION_COST = 1;
export const APPEARANCE_PLAN_ACTION = "appearance:plan";
export const APPEARANCE_CHECKIN_ACTION = "appearance:checkin";

export const APPEARANCE_CHECKIN_WINDOWS = [0, 30, 60, 90] as const;

export function appearanceAgentDisabledResponse(status = 503) {
  return {
    status,
    body: {
      ...APPEARANCE_AGENT.disabled_http,
      enabled: APPEARANCE_AGENT.enabled,
      status: APPEARANCE_AGENT.status,
      target_days: APPEARANCE_AGENT.target_days,
      depends_on: [...APPEARANCE_AGENT.depends_on]
    }
  };
}

export type AppearanceCompareSnapshot = {
  job_id: number;
  status: string;
  summary: string | null;
  completed_at: unknown;
};

export type AppearancePlanRow = {
  id: number;
  goal: string;
  status: string;
  day_index: number;
  target_days: number;
  started_at: unknown;
  created_at: unknown;
  baseline_interaction_id: number | null;
  baseline_image_ref: string | null;
};

export type AppearanceHistorySnapshot = {
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
    created_at: unknown;
  } | null;
  latest_compare: AppearanceCompareSnapshot | null;
  active_plan: AppearancePlanRow | null;
};

export type AppearanceHistoryFailure = {
  ok: false;
  error: "no_account_learning_history" | "no_compare_history";
  message: string;
};

export type HonestAppearancePlan = {
  summary: string;
  goal: string;
  target_days: number;
  windows: Array<{ day: number; kind: string; note: string }>;
  score: Record<string, unknown>;
  data: Record<string, unknown>;
};

export type HonestAppearanceCheckin = {
  summary: string;
  day_index: number;
  score: Record<string, unknown>;
  data: Record<string, unknown>;
};

export function hasAccountLearningHistory(snapshot: AppearanceHistorySnapshot): boolean {
  return Boolean(
    hasPreferencePayload(snapshot.profile) ||
      snapshot.latest_interaction ||
      snapshot.latest_recommendation
  );
}

export function hasCompareHistory(snapshot: AppearanceHistorySnapshot): boolean {
  return snapshot.latest_compare != null && Number.isFinite(snapshot.latest_compare.job_id);
}

export function requiredAppearanceHistory(
  snapshot: AppearanceHistorySnapshot
): { ok: true } | AppearanceHistoryFailure {
  if (!hasAccountLearningHistory(snapshot)) {
    return {
      ok: false,
      error: "no_account_learning_history",
      message:
        "Appearance needs stored Account Learning history (profile, interaction, or recommendation). Nothing was invented."
    };
  }
  if (!hasCompareHistory(snapshot)) {
    return {
      ok: false,
      error: "no_compare_history",
      message:
        "Appearance needs a Compare Me To Me job on this account. Run compareMeToMe first. Nothing was invented."
    };
  }
  return { ok: true };
}

export function sanitizeAppearanceGoal(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().slice(0, 200) : "";
  if (!raw || looksMedical(raw)) return "professional image";
  return raw;
}

export function appearanceDayIndex(startedAt: unknown, now = Date.now()): number {
  const start = startedAt ? new Date(String(startedAt)).getTime() : NaN;
  if (!Number.isFinite(start)) return 0;
  const days = Math.floor((now - start) / 86_400_000);
  return Math.min(APPEARANCE_AGENT.target_days, Math.max(0, days));
}

function preferenceKeys(profile: Record<string, unknown> | null): string[] {
  return Object.keys(asRecord(profile?.preferences));
}

function storedCompareSummary(snapshot: AppearanceHistorySnapshot): string | null {
  const raw = firstString(snapshot.latest_compare?.summary);
  if (!raw || looksMedical(raw)) return null;
  return raw.slice(0, 300);
}

function honestyFlags(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    live_coaching: false,
    live_product: false,
    medical_claims: false,
    invented_advice: false,
    public_unauthenticated: false,
    ...extra
  };
}

/**
 * Honest 90-day professional-image plan from stored history.
 * Recaps what exists. Does not invent coaching, products, or medical claims.
 */
export function buildHonestAppearancePlan(
  snapshot: AppearanceHistorySnapshot,
  goalInput?: unknown
): HonestAppearancePlan {
  const goal = sanitizeAppearanceGoal(goalInput);
  const keys = preferenceKeys(snapshot.profile);
  const compareSummary = storedCompareSummary(snapshot);
  const windows = APPEARANCE_CHECKIN_WINDOWS.map((day) => ({
    day,
    kind: day === 0 ? "baseline" : day === 90 ? "complete" : "checkin_window",
    note:
      day === 0
        ? "Recorded from stored Account Learning + Compare history"
        : day === 90
          ? "Elapsed-time complete — not a scored or medical result"
          : "Check in when new Compare or Account Learning history exists"
  }));

  return {
    summary:
      "90-day professional-image plan recorded from your stored Account Learning and Compare history. This is a check-in schedule, not live coaching, medical advice, or a new product recommendation.",
    goal,
    target_days: APPEARANCE_AGENT.target_days,
    windows,
    score: honestyFlags({
      mode: "history_plan",
      history_present: true,
      has_compare: hasCompareHistory(snapshot)
    }),
    data: honestyFlags({
      preference_keys: keys,
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
            generated_by_appearance: false
          }
        : null,
      latest_compare: snapshot.latest_compare
        ? {
            job_id: snapshot.latest_compare.job_id,
            status: snapshot.latest_compare.status,
            summary: compareSummary
          }
        : null,
      windows,
      note: "Recap of already-persisted prefs/history. Not LIVE coaching and not a product recommendation."
    })
  };
}

/**
 * Honest check-in recap from stored history at an elapsed day index.
 */
export function buildHonestAppearanceCheckin(
  snapshot: AppearanceHistorySnapshot,
  plan: AppearancePlanRow,
  now = Date.now()
): HonestAppearanceCheckin {
  const day_index = appearanceDayIndex(plan.started_at || plan.created_at, now);
  const keys = preferenceKeys(snapshot.profile);
  const compareSummary = storedCompareSummary(snapshot);

  return {
    summary: `Check-in recorded from stored history at day ${day_index} of ${APPEARANCE_AGENT.target_days}. Recap only — no new coaching, medical claim, or product.`,
    day_index,
    score: honestyFlags({
      mode: "history_checkin",
      history_present: true,
      day_index,
      target_days: APPEARANCE_AGENT.target_days
    }),
    data: honestyFlags({
      plan_id: plan.id,
      preference_keys: keys,
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
            generated_by_appearance: false
          }
        : null,
      latest_compare: snapshot.latest_compare
        ? {
            job_id: snapshot.latest_compare.job_id,
            status: snapshot.latest_compare.status,
            summary: compareSummary
          }
        : null,
      note: "Recap of already-persisted prefs/history. Not LIVE coaching and not a product recommendation."
    })
  };
}
