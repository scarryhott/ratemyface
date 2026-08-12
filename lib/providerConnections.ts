/**
 * Social provider OAuth connection framework (skeleton only).
 *
 * Schema may exist (rmf_provider_connections) for ops/RLS, but live OAuth stays
 * not_configured until provider credentials are set. Never scrape. User-
 * authorized OAuth only when wired later. Do not log raw token secrets.
 */

export const PLANNED_SOCIAL_PROVIDERS = [
  "instagram",
  "linkedin",
  "tiktok"
] as const;

export type PlannedSocialProvider = (typeof PLANNED_SOCIAL_PROVIDERS)[number];

export const SOCIAL_PROVIDER_OAUTH = {
  /** Live OAuth launch stays off until secrets are configured. */
  enabled: false as const,
  /** Health / OpenAPI-facing status while scaffolding. */
  status: "not_configured" as const,
  /** Operator dashboard status badge. */
  dashboard_status: "UNAVAILABLE" as const,
  note: "OAuth skeleton only. Instagram, LinkedIn, TikTok planned — user-authorized OAuth only. No scraping. No live connect until provider credentials exist.",
  gate: "Do NOT enable live social OAuth until provider secrets are configured. Store encrypted token refs only — never raw secrets in logs.",
  table: "rmf_provider_connections" as const,
  providers: PLANNED_SOCIAL_PROVIDERS,
  auth_mode: "oauth_user_authorized" as const,
  scraping: false as const,
  not_configured_http: {
    ok: false as const,
    error: "not_configured" as const,
    message:
      "Social provider OAuth is not configured yet. Connections stay planned until Instagram / LinkedIn / TikTok credentials are wired."
  }
};

export function isPlannedSocialProvider(value: string): value is PlannedSocialProvider {
  return (PLANNED_SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

/** Connect / disconnect stubs until provider OAuth credentials exist. */
export function socialProviderNotConfiguredResponse(status = 501) {
  return {
    status,
    body: {
      ...SOCIAL_PROVIDER_OAUTH.not_configured_http,
      enabled: SOCIAL_PROVIDER_OAUTH.enabled,
      status: SOCIAL_PROVIDER_OAUTH.status,
      providers: [...SOCIAL_PROVIDER_OAUTH.providers],
      auth_mode: SOCIAL_PROVIDER_OAUTH.auth_mode,
      scraping: SOCIAL_PROVIDER_OAUTH.scraping
    }
  };
}

/**
 * True only when every required secret for a provider is present.
 * Skeleton: always false — no provider credentials are wired yet.
 */
export function socialProviderCredentialsConfigured(
  _provider?: PlannedSocialProvider
): boolean {
  // Intentionally gated off. Wire per-provider env checks when launching OAuth.
  void _provider;
  return false;
}
