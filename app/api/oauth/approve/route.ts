import { NextRequest, NextResponse } from "next/server";
import { createAuthorizationCode, validClient } from "../../../../lib/oauthBridge";

function supabaseUrl(): string | null {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
}

function supabasePublicKey(): string | null {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    null
  );
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
  const apiKey = supabasePublicKey();
  if (!url || !apiKey) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured", missing: { url: !url, public_key: !apiKey } },
      { status: 503 }
    );
  }

  const userResponse = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: apiKey
    },
    cache: "no-store"
  });

  if (!userResponse.ok) {
    const details = await userResponse.json().catch(() => ({}));
    return NextResponse.json(
      { ok: false, error: "not_authenticated", supabase_status: userResponse.status, details },
      { status: 401 }
    );
  }

  const user = await userResponse.json().catch(() => ({}));
  if (typeof user?.id !== "string" || !user.id) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 401 });
  }

  const code = await createAuthorizationCode(user.id, clientId, redirectUri, scope);
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return NextResponse.json({ ok: true, redirect_url: redirect.toString() });
}
