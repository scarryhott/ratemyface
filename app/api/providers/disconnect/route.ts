import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import {
  isPlannedSocialProvider,
  socialProviderCredentialsConfigured,
  socialProviderNotConfiguredResponse
} from "../../../../lib/providerConnections";
import { revokeProviderConnection } from "../../../../lib/providerConnectionsDb";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";

export const runtime = "nodejs";

/**
 * Disconnect / revoke a provider connection — skeleton.
 * While OAuth credentials are absent, returns 501 not_configured
 * unless a stored row exists (then soft-revokes without exposing secrets).
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

  // Live OAuth not launched — prefer clear not_configured when no credentials.
  if (!socialProviderCredentialsConfigured(provider)) {
    if (!databaseConfigured()) {
      const { status, body: stub } = socialProviderNotConfiguredResponse(501);
      return NextResponse.json(
        { ...stub, provider, operation: "disconnect" },
        { status }
      );
    }

    const revoked = await revokeProviderConnection(user.id, provider);
    if (!revoked) {
      const { status, body: stub } = socialProviderNotConfiguredResponse(501);
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
      note: "Soft-revoked stored row. Live OAuth remains not_configured until credentials exist."
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "not_configured",
      provider,
      message: "OAuth disconnect not fully implemented for this provider yet."
    },
    { status: 501 }
  );
}
