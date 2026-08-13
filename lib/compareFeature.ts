/**
 * Compare Me To Me feature gate.
 *
 * Public GPT / OpenAPI stay DISABLED (`enabled=false`, `/api/compare` 503).
 * Schema exists for ops/RLS. An authenticated OAuth / owner / operator TEST
 * path may persist jobs from Account Learning history — that does not flip LIVE.
 *
 * Account Learning may also insert a queued test job with source_interaction_id
 * when RMF_COMPARE_TEST_LINK=1 (see lib/compareJobs.ts). That still does not
 * enable this flag or public /api/compare.
 */

export const COMPARE_ME_TO_ME = {
  enabled: false as const,
  /** Health / OpenAPI-facing status. Public feature stays off. */
  status: "testing" as const,
  /** Operator dashboard status badge — TESTING while public remains disabled. */
  dashboard_status: "TESTING" as const,
  note: "Public GPT/OpenAPI stays off. Authenticated OAuth/operator test path may persist jobs from Account Learning history. Not LIVE photo compare and not a product Action.",
  gate: "Public /api/compare remains 503 compare_disabled. Do NOT enable production until consented image storage + live analysis exist. Authenticated test path is internal only.",
  tables: ["rmf_compare_jobs", "rmf_compare_results"] as const,
  authenticated_test_path: "/api/compare/test" as const,
  disabled_http: {
    ok: false as const,
    error: "compare_disabled" as const,
    message:
      "Compare Me To Me is not available yet. Account Learning + consented history must ship first."
  }
};

/** Credits charged for the authenticated history-placeholder test (not live vision). */
export const COMPARE_TEST_ACTION_COST = 1;
export const COMPARE_TEST_ACTION = "compare:authenticated_test";

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

/** Opt-in queued job linker on learning writes. Does not enable COMPARE_ME_TO_ME or /api/compare. */
export function compareTestLinkEnabled(): boolean {
  return process.env.RMF_COMPARE_TEST_LINK === "1";
}
