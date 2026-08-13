import { NextRequest, NextResponse } from "next/server";
import {
  databaseConfigured,
  isDatabaseTimeoutError,
  PROVIDER_OAUTH_TIMEOUT_MS,
  withDatabaseTimeout
} from "../../../lib/db";
import {
  SOCIAL_PROVIDER_OAUTH,
  socialProviderCredentialsConfigured
} from "../../../lib/providerConnections";
import { listProvidersCatalog } from "../../../lib/providerConnectionsDb";
import { currentOAuthUser } from "../../../lib/supabaseAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * List social provider connection catalog + stored rows.
 * Never returns raw token secrets. Scraping stays false.
 */
export async function GET(req: NextRequest) {
  const user = await currentOAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  }

  if (!databaseConfigured()) {
    return NextResponse.json(
      {
        ok: true,
        enabled: SOCIAL_PROVIDER_OAUTH.enabled,
        status: SOCIAL_PROVIDER_OAUTH.status,
        database_configured: false,
        planned: [...SOCIAL_PROVIDER_OAUTH.providers],
        configured_providers: SOCIAL_PROVIDER_OAUTH.configured_providers,
        connections: [],
        catalog: SOCIAL_PROVIDER_OAUTH.providers.map((provider) => {
          const oauth_ready = socialProviderCredentialsConfigured(provider);
          return {
            provider,
            status: oauth_ready ? "not_connected" : "not_configured",
            oauth_ready,
            connection: null
          };
        }),
        scraping: SOCIAL_PROVIDER_OAUTH.scraping,
        note: SOCIAL_PROVIDER_OAUTH.note
      },
      { status: 200 }
    );
  }

  try {
    const data = await withDatabaseTimeout(
      () => listProvidersCatalog(user.id),
      PROVIDER_OAUTH_TIMEOUT_MS
    );
    return NextResponse.json({
      ok: true,
      database_configured: true,
      ...data.framework,
      planned: data.planned,
      connections: data.connections,
      catalog: data.catalog
    });
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json({ ok: false, error: "database_timeout" }, { status: 504 });
    }
    throw error;
  }
}
