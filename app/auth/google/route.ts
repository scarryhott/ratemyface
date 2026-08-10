import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  const { url, key } = supabaseConfig();
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const nextRaw = request.nextUrl.searchParams.get("next") || "/operator";
  const next = nextRaw.startsWith("/") ? nextRaw : "/operator";
  const callback = new URL("/auth/google/callback", request.nextUrl.origin);
  callback.searchParams.set("next", next);

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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true
    }
  });

  if (error || !data.url) {
    const failed = new URL("/operator/login", request.nextUrl.origin);
    failed.searchParams.set("auth_error", error?.message || "google_oauth_start_failed");
    return NextResponse.redirect(failed);
  }

  const response = NextResponse.redirect(data.url);
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  return response;
}
