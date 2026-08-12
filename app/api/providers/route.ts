import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../lib/db";
import { SOCIAL_PROVIDER_OAUTH } from "../../../lib/providerConnections";
import { listProvidersCatalog } from "../../../lib/providerConnectionsDb";
import { currentOAuthUser } from "../../../lib/supabaseAuth";

export const runtime = "nodejs";

/**
 * List social provider connection catalog + stored rows.
 * OAuth launch stays not_configured; never returns raw token secrets.
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
        connections: [],
        catalog: SOCIAL_PROVIDER_OAUTH.providers.map((provider) => ({
          provider,
          status: SOCIAL_PROVIDER_OAUTH.status,
          oauth_ready: false,
          connection: null
        })),
        note: SOCIAL_PROVIDER_OAUTH.note
      },
      { status: 200 }
    );
  }

  const data = await listProvidersCatalog(user.id);
  return NextResponse.json({
    ok: true,
    database_configured: true,
    ...data.framework,
    planned: data.planned,
    connections: data.connections,
    catalog: data.catalog
  });
}
