import { NextRequest, NextResponse } from "next/server";
import {
  databaseConfigured,
  isDatabaseTimeoutError,
  PROVIDER_OAUTH_TIMEOUT_MS,
  withDatabaseTimeout
} from "../../../../lib/db";
import {
  isPlannedSocialProvider,
  socialProviderCredentialsConfigured,
  socialProviderNotConfiguredResponse
} from "../../../../lib/providerConnections";
import { revokeProviderConnection } from "../../../../lib/providerConnectionsDb";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Disconnect / revoke a provider connection.
 * Soft-revokes the stored row (clears token_ref). Never logs raw tokens.
 * Unconfigured providers stay 501 unless a stored row exists.
 */
export async function POST(req: NextRequest) {
  const user = await currentOAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const provider = String(body?.provider || "").toLowerCase().trim();

  if (!provider || !isPlannedSocialProvider(provider)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_provider",
        message: "provider must be one of: instagram, linkedin, tiktok",
        planned: ["instagram", "linkedin", "tiktok"]
      },
      { status: 400 }
    );
  }

  const configured = socialProviderCredentialsConfigured(provider);

  if (!configured) {
    if (!databaseConfigured()) {
      const { status, body: stub } = socialProviderNotConfiguredResponse(501, provider);
      return NextResponse.json(
        { ...stub, provider, operation: "disconnect" },
        { status }
      );
    }

    try {
      const revoked = await withDatabaseTimeout(
        () => revokeProviderConnection(user.id, provider),
        PROVIDER_OAUTH_TIMEOUT_MS
      );
      if (!revoked) {
        const { status, body: stub } = socialProviderNotConfiguredResponse(501, provider);
        return NextResponse.json(
          {
            ...stub,
            provider,
            operation: "disconnect",
            message:
              "Social provider OAuth is not configured and no connection row exists to revoke."
          },
          { status }
        );
      }

      return NextResponse.json({
        ok: true,
        operation: "disconnect",
        provider,
        connection: revoked,
        note: "Soft-revoked stored row. Live OAuth remains not_configured for this provider."
      });
    } catch (error) {
      if (isDatabaseTimeoutError(error)) {
        return NextResponse.json({ ok: false, error: "database_timeout" }, { status: 504 });
      }
      throw error;
    }
  }

  if (!databaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "database_not_configured", provider, operation: "disconnect" },
      { status: 503 }
    );
  }

  try {
    const revoked = await withDatabaseTimeout(
      () => revokeProviderConnection(user.id, provider),
      PROVIDER_OAUTH_TIMEOUT_MS
    );
    if (!revoked) {
      return NextResponse.json(
        {
          ok: false,
          error: "not_connected",
          provider,
          operation: "disconnect",
          message: "No connection row exists to revoke."
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      operation: "disconnect",
      provider,
      connection: revoked,
      note: "Soft-revoked stored row. Encrypted token_ref cleared. No scraping."
    });
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json({ ok: false, error: "database_timeout" }, { status: 504 });
    }
    throw error;
  }
}
