/**
 * Social provider OAuth connection framework.
 *
 * Never scrape. User-authorized OAuth only. Instagram / LinkedIn stay
 * not_configured until their env exists. TikTok is live when
 * TIKTOK_OAUTH_CLIENT_KEY and TIKTOK_OAUTH_CLIENT_SECRET are set.
 * Store encrypted token_ref only — never log raw token secrets.
 */

export const PLANNED_SOCIAL_PROVIDERS = [
  "instagram",
  "linkedin",
  "tiktok"
] as const;

export type PlannedSocialProvider = (typeof PLANNED_SOCIAL_PROVIDERS)[number];

const PROVIDER_ENV: Record<PlannedSocialProvider, readonly [string, string]> = {
  instagram: ["INSTAGRAM_OAUTH_CLIENT_ID", "INSTAGRAM_OAUTH_CLIENT_SECRET"],
  linkedin: ["LINKEDIN_OAUTH_CLIENT_ID", "LINKEDIN_OAUTH_CLIENT_SECRET"],
  tiktok: ["TIKTOK_OAUTH_CLIENT_KEY", "TIKTOK_OAUTH_CLIENT_SECRET"]
};

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function isPlannedSocialProvider(value: string): value is PlannedSocialProvider {
  return (PLANNED_SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

/**
 * True only when every required secret for that provider is present.
 * Omit provider to mean "at least one provider is configured".
 */
export function socialProviderCredentialsConfigured(
  provider?: PlannedSocialProvider
): boolean {
  if (!provider) return configuredSocialProviders().length > 0;
  return PROVIDER_ENV[provider].every(envPresent);
}

export function configuredSocialProviders(): PlannedSocialProvider[] {
  return PLANNED_SOCIAL_PROVIDERS.filter((provider) =>
    PROVIDER_ENV[provider].every(envPresent)
  );
}

export function anySocialProviderConfigured(): boolean {
  return configuredSocialProviders().length > 0;
}

function socialNote(): string {
  const configured = configuredSocialProviders();
  const wired = configured.length
    ? `Configured: ${configured.join(", ")}.`
    : "No provider credentials wired yet.";
  return `User-authorized OAuth only. No scraping. ${wired} Instagram and LinkedIn stay not_configured until their env exists. Store encrypted token_ref only — never raw secrets in logs.`;
}

export const SOCIAL_PROVIDER_OAUTH = {
  /** Live OAuth when at least one provider's secrets exist. */
  get enabled(): boolean {
    return anySocialProviderConfigured();
  },
  get status(): "configured" | "not_configured" {
    return anySocialProviderConfigured() ? "configured" : "not_configured";
  },
  get dashboard_status(): "LIVE" | "NOT_CONFIGURED" {
    return anySocialProviderConfigured() ? "LIVE" : "NOT_CONFIGURED";
  },
  get note(): string {
    return socialNote();
  },
  get configured_providers(): PlannedSocialProvider[] {
    return configuredSocialProviders();
  },
  gate: "Do not scrape. User-authorized OAuth only. TikTok launches when TIKTOK_OAUTH_CLIENT_KEY and TIKTOK_OAUTH_CLIENT_SECRET are set. Instagram/LinkedIn stay 501 until their credentials exist. Store encrypted token refs only — never raw secrets in logs.",
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

/** Connect / disconnect stubs until that provider's OAuth credentials exist. */
export function socialProviderNotConfiguredResponse(
  status = 501,
  provider?: PlannedSocialProvider
) {
  const message = provider
    ? `${provider} OAuth is not configured. User-authorized OAuth only — no scraping.`
    : SOCIAL_PROVIDER_OAUTH.not_configured_http.message;
  return {
    status,
    body: {
      ok: false as const,
      error: "not_configured" as const,
      message,
      enabled: SOCIAL_PROVIDER_OAUTH.enabled,
      status: "not_configured" as const,
      provider: provider || null,
      configured_providers: configuredSocialProviders(),
      providers: [...SOCIAL_PROVIDER_OAUTH.providers],
      auth_mode: SOCIAL_PROVIDER_OAUTH.auth_mode,
      scraping: SOCIAL_PROVIDER_OAUTH.scraping
    }
  };
}
