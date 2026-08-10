import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { identifyConfiguredOwner } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

function supabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ""
  };
}

function safeNext(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("next") || "/operator";
  return raw.startsWith("/") ? raw : "/operator";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const { url, key } = supabaseConfig();
  if (!code || !url || !key) {
    const failed = new URL("/operator/login", request.nextUrl.origin);
    failed.searchParams.set("auth_error", "google_callback_missing_code_or_config");
    return NextResponse.redirect(failed);
  }

  const pendingCookies: Array<{ name: string; value: string; options: any }> = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pendingCookies.push(...cookiesToSet);
      }
    }
  });

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const failed = new URL("/operator/login", request.nextUrl.origin);
    failed.searchParams.set("auth_error", exchangeError.message);
    const response = NextResponse.redirect(failed);
    for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options);
    return response;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const owner = userError ? null : identifyConfiguredOwner(userData.user);
  if (!owner) {
    await supabase.auth.signOut().catch(() => undefined);
    const failed = new URL("/operator/login", request.nextUrl.origin);
    failed.searchParams.set("auth_error", "owner_not_authorized");
    const response = NextResponse.redirect(failed);
    for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options);
    return response;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.access_token) {
    const failed = new URL("/operator/login", request.nextUrl.origin);
    failed.searchParams.set("auth_error", "google_session_missing_access_token");
    const response = NextResponse.redirect(failed);
    for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options);
    return response;
  }

  const response = NextResponse.redirect(new URL(safeNext(request), request.nextUrl.origin));
  for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options);
  response.cookies.set("rmf_owner_access", session.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, Number(session.expires_in || 3600))
  });
  if (session.refresh_token) {
    response.cookies.set("rmf_owner_refresh", session.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  }
  return response;
}
