/**
 * Autonomous Appearance Agent feature gate.
 *
 * Schema may exist (rmf_appearance_plans / rmf_appearance_checkins) for ops/RLS,
 * but the product path stays DISABLED until Account Learning history + Compare Me
 * To Me (+ optional social) gates are met. Do not claim LIVE paid coaching.
 * Do not flip LIVE here. No OpenAPI Action until the flag is on.
 */

export const APPEARANCE_AGENT = {
  enabled: false as const,
  /** Health / OpenAPI-facing status while scaffolding. */
  status: "requires_compare_and_learning" as const,
  /** Operator dashboard status badge. */
  dashboard_status: "DISABLED" as const,
  note: "Scaffold only — not LIVE paid coaching. Depends on Account Learning history + Compare Me To Me (+ optional social). Future paid ops meter via PERSONAL_ACTION_COST (1), the same Stripe credit unit as Personal Network and Compare.",
  gate: "Do NOT enable production until Account Learning history + Compare Me To Me path are ready. Schema may exist; feature remains DISABLED. No OpenAPI Action yet.",
  tables: ["rmf_appearance_plans", "rmf_appearance_checkins"] as const,
  target_days: 90 as const,
  depends_on: [
    "account_learning",
    "compare_me_to_me",
    "optional_social_providers"
  ] as const,
  disabled_http: {
    ok: false as const,
    error: "appearance_agent_disabled" as const,
    message:
      "Appearance Agent is not available yet. It is not LIVE paid coaching. Account Learning + Compare Me To Me must ship first; credits will meter future paid ops."
  }
};

/** Always-disabled HTTP stub (503). Draft-only writes stay server-gated until flag flips. */
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
