import { NextRequest, NextResponse } from "next/server";
import { oauthClientValidation, validClient } from "../../../lib/oauthBridge";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const clientId = q.get("client_id") || "";
  const redirectUri = q.get("redirect_uri") || "";
  const responseType = q.get("response_type") || "";
  const state = q.get("state") || "";
  const scope = q.get("scope") || "";

  if (responseType !== "code") {
    return NextResponse.json({ error: "unsupported_response_type" }, { status: 400 });
  }
  if (!validClient(clientId, redirectUri)) {
    return NextResponse.json(
      {
        error: "invalid_client_or_redirect_uri",
        diagnostic: oauthClientValidation(clientId, redirectUri)
      },
      { status: 400 }
    );
  }

  const consent = new URL("/oauth/consent", request.nextUrl.origin);
  consent.searchParams.set("client_id", clientId);
  consent.searchParams.set("redirect_uri", redirectUri);
  consent.searchParams.set("state", state);
  consent.searchParams.set("scope", scope);
  return NextResponse.redirect(consent);
}
