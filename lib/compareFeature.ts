/**
 * Compare Me To Me feature gate.
 *
 * Schema may exist (rmf_compare_jobs / rmf_compare_results) for ops/RLS, but the
 * product path stays DISABLED until Account Learning + image consent/history
 * are verified in production. Do not flip LIVE here.
 */

export const COMPARE_ME_TO_ME = {
  enabled: false as const,
  /** Health / OpenAPI-facing status while scaffolding. */
  status: "requires_account_learning" as const,
  /** Operator dashboard status badge. */
  dashboard_status: "DISABLED" as const,
  note: "Scaffold only. Ship after consented Personal Network read/write is verified in production.",
  gate: "Do NOT enable production until image storage + consent + history exist. Schema may exist; feature remains DISABLED.",
  tables: ["rmf_compare_jobs", "rmf_compare_results"] as const,
  disabled_http: {
    ok: false as const,
    error: "compare_disabled" as const,
    message:
      "Compare Me To Me is not available yet. Account Learning + consented history must ship first."
  }
};

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
