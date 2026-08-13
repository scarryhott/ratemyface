/**
 * Compare Me To Me — paid authenticated OpenAPI Action.
 *
 * Unauthenticated / anonymous compare is not a product (401 on /api/compare,
 * 503 on /api/compare/jobs). Appearance Agent stays off. Vision is attempted
 * when fetchable https image refs exist; dashboard must not claim LIVE if
 * vision is limited.
 *
 * Internal POST /api/compare/test remains a history-placeholder path.
 */

export const COMPARE_ME_TO_ME = {
  enabled: true as const,
  /** Health / OpenAPI-facing status. Paid Action, not a LIVE marketing claim. */
  status: "paid" as const,
  /** Operator dashboard status badge — PAID, not LIVE. */
  dashboard_status: "PAID" as const,
  vision_status: "limited" as const,
  note: "Paid compareMeToMe Action (OAuth + 1 credit, same unit as Personal Network, + consent_compare + real before/after image refs). Vision runs when https image URLs are fetchable via AI Gateway; otherwise the result is an honest limited compare. Not a free public product and not a LIVE unlimited-vision claim.",
  gate: "Paid OpenAPI Action at POST /api/compare. Unauthenticated callers get 401. Job listing stays 503. Requires consent_compare=true and real image refs (4xx if missing — never placeholder-as-real). Vision limited. Appearance Agent stays off. Cost is PERSONAL_ACTION_COST (1), not a vision surcharge.",
  tables: ["rmf_compare_jobs", "rmf_compare_results"] as const,
  action_path: "/api/compare" as const,
  authenticated_test_path: "/api/compare/test" as const,
  disabled_http: {
    ok: false as const,
    error: "compare_jobs_not_public" as const,
    message:
      "Public compare job listing is not available. Use the authenticated compareMeToMe Action."
  }
};

/** Same Stripe credit unit as Personal Network (`PERSONAL_ACTION_COST`) — do not invent a vision surcharge. */
export const COMPARE_TEST_ACTION_COST = 1;
export const COMPARE_TEST_ACTION = "compare:authenticated_test";

export const COMPARE_ACTION_COST = 1;
export const COMPARE_ACTION = "compare:me_to_me";

export function compareDisabledResponse(status = 503) {
  return {
    status,
    body: {
      ...COMPARE_ME_TO_ME.disabled_http,
      enabled: COMPARE_ME_TO_ME.enabled,
      status: COMPARE_ME_TO_ME.status
    }
  };
}

/** Opt-in queued job linker on learning writes. Does not expose anonymous compare. */
export function compareTestLinkEnabled(): boolean {
  return process.env.RMF_COMPARE_TEST_LINK === "1";
}
