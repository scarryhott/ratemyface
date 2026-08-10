import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const nextRaw = request.nextUrl.searchParams.get("next") || "/operator";
  const next = nextRaw.startsWith("/") ? nextRaw : "/operator";
  const login = new URL("/operator/login", request.nextUrl.origin);
  login.searchParams.set("provider", "google");
  login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}
