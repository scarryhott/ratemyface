import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import {
  isPlannedSocialProvider,
  socialProviderCredentialsConfigured,
  socialProviderNotConfiguredResponse
} from "../../../../lib/providerConnections";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";
import { tiktokAuthorizeUrl, tiktokOAuthConfigured } from "../../../../lib/tiktokOAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Start provider OAuth connect. User-authorized OAuth only — never scrape.
 * TikTok returns an authorize URL when env is present. Instagram/LinkedIn stay 501.
 * Connect is account linking, not a metered coaching Action.
 */
export async function POST(req: NextRequest) {
  const user = await currentOAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const provider = String(body?.provider || "").toLowerCase().trim();
  const redirect = body?.redirect === true;

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
    const { status, body: stub } = socialProviderNotConfiguredResponse(501, provider);
    return NextResponse.json(
      {
        ...stub,
        provider,
        operation: "connect"
      },
      { status }
    );
  }

  if (provider === "tiktok" && tiktokOAuthConfigured()) {
    if (!databaseConfigured()) {
      return NextResponse.json(
        { ok: false, error: "database_not_configured", provider, operation: "connect" },
        { status: 503 }
      );
    }
    const started = tiktokAuthorizeUrl(user.id);
    if (redirect) {
      return NextResponse.redirect(started.authorize_url, 302);
    }
    return NextResponse.json({
      ok: true,
      operation: "connect",
      provider,
      authorize_url: started.authorize_url,
      redirect_uri: started.redirect_uri,
      scopes: started.scopes.split(/[,\s]+/).filter(Boolean),
      scraping: false,
      metered: false,
      note: "Open authorize_url to complete TikTok Login Kit. Callback stores encrypted token_ref only."
    });
  }

  const { status, body: stub } = socialProviderNotConfiguredResponse(501, provider);
  return NextResponse.json(
    {
      ...stub,
      provider,
      operation: "connect",
      message: "OAuth authorize URL not implemented for this provider yet."
    },
    { status }
  );
}
