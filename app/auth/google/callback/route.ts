import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextRaw = request.nextUrl.searchParams.get("next") || "/operator";
  const next = nextRaw.startsWith("/") ? nextRaw : "/operator";
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!code || !base || !anon) return NextResponse.redirect(new URL(`/operator?auth_error=google_callback`, request.nextUrl.origin));

  const response = await fetch(`${base.replace(/\/$/, "")}/auth/v1/token?grant_type=pkce`, {
    method:"POST",
    headers:{ apikey:anon, "Content-Type":"application/json" },
    body:JSON.stringify({ auth_code:code })
  });
  if (!response.ok) return NextResponse.redirect(new URL(`/operator?auth_error=google_exchange`, request.nextUrl.origin));
  const data = await response.json();
  const access = typeof data?.access_token === "string" ? data.access_token : "";
  const refresh = typeof data?.refresh_token === "string" ? data.refresh_token : "";
  if (!access) return NextResponse.redirect(new URL(`/operator?auth_error=missing_token`, request.nextUrl.origin));

  const out = NextResponse.redirect(new URL(next, request.nextUrl.origin));
  out.cookies.set("rmf_owner_access", access, { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge:3600 });
  if (refresh) out.cookies.set("rmf_owner_refresh", refresh, { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge:60*60*24*30 });
  return out;
}
