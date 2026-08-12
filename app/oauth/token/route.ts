import { NextRequest, NextResponse } from "next/server";
import { basicClientCredentials, exchangeAuthorizationCode, oauthClientSecret, refreshAccessToken, OAUTH_CLIENT_ID } from "../../../lib/oauthBridge";
import { ensureSignupCreditGrant } from "../../../lib/stripeBilling";

function tokenError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status });
}

export async function POST(request: NextRequest) {
  const creds = basicClientCredentials(request.headers.get("authorization"));
  if (!creds || creds.clientId !== OAUTH_CLIENT_ID || !oauthClientSecret() || creds.clientSecret !== oauthClientSecret()) {
    return tokenError("invalid_client", "Client authentication failed.", 401);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return tokenError("invalid_request", "Form body required.");
  const grantType = String(form.get("grant_type") || "");

  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    if (!code || !redirectUri) return tokenError("invalid_request", "code and redirect_uri are required.");
    const result = await exchangeAuthorizationCode(code, creds.clientId, redirectUri);
    if (!result) return tokenError("invalid_grant", "Authorization code is invalid, expired, or already used.");
    // Idempotent product-credit bootstrap (not a Stripe purchase) so Account Learning can run before checkout.
    await ensureSignupCreditGrant(result.userId).catch(() => 0);
    return NextResponse.json({
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: 86400,
      refresh_token: result.refreshToken,
      scope: result.scope
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") || "");
    if (!refreshToken) return tokenError("invalid_request", "refresh_token is required.");
    const result = await refreshAccessToken(refreshToken, creds.clientId);
    if (!result) return tokenError("invalid_grant", "Refresh token is invalid or revoked.");
    return NextResponse.json({
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: 86400,
      refresh_token: result.refreshToken,
      scope: result.scope
    });
  }

  return tokenError("unsupported_grant_type", "Supported grants are authorization_code and refresh_token.");
}
