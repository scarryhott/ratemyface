import { NextRequest, NextResponse } from "next/server";
import { createAuthorizationCode, validClient } from "../../../../lib/oauthBridge";

function supabaseUrl(): string | null {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const accessToken = typeof body.supabase_access_token === "string" ? body.supabase_access_token : "";
  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  const state = typeof body.state === "string" ? body.state : "";
  const scope = typeof body.scope === "string" ? body.scope : "";
  if (!accessToken || !validClient(clientId, redirectUri)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const url = supabaseUrl();
  if (!url) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const userResponse = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!userResponse.ok) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const user = await userResponse.json().catch(() => ({}));
  if (typeof user?.id !== "string" || !user.id) return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 401 });

  const code = await createAuthorizationCode(user.id, clientId, redirectUri, scope);
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  return NextResponse.json({ ok: true, redirect_url: redirect.toString() });
}
