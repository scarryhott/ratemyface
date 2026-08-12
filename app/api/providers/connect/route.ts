import { NextRequest, NextResponse } from "next/server";
import {
  isPlannedSocialProvider,
  socialProviderCredentialsConfigured,
  socialProviderNotConfiguredResponse
} from "../../../../lib/providerConnections";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";

export const runtime = "nodejs";

/**
 * Start provider OAuth connect — skeleton stub.
 * Returns 501 not_configured until provider credentials exist.
 * Never scrapes. User-authorized OAuth only when wired later.
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

  if (!socialProviderCredentialsConfigured(provider)) {
    const { status, body: stub } = socialProviderNotConfiguredResponse(501);
    return NextResponse.json(
      {
        ...stub,
        provider,
        operation: "connect"
      },
      { status }
    );
  }

  // Unreachable until credentials are wired; keep explicit guard.
  return NextResponse.json(
    {
      ok: false,
      error: "not_configured",
      provider,
      message: "OAuth authorize URL not implemented for this provider yet."
    },
    { status: 501 }
  );
}
