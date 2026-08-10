import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!base) return NextResponse.json({ ok:false, error:"supabase_not_configured" }, { status:503 });
  const next = request.nextUrl.searchParams.get("next") || "/operator";
  const callback = new URL("/auth/google/callback", request.nextUrl.origin);
  callback.searchParams.set("next", next.startsWith("/") ? next : "/operator");
  const authorize = new URL(`${base.replace(/\/$/, "")}/auth/v1/authorize`);
  authorize.searchParams.set("provider", "google");
  authorize.searchParams.set("redirect_to", callback.toString());
  return NextResponse.redirect(authorize);
}
