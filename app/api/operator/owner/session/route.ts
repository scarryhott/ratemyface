import { NextRequest, NextResponse } from "next/server";
import { identifyConfiguredOwner, userForSupabaseAccessToken } from "../../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) return NextResponse.json({ ok:false, error:"missing_access_token" }, { status:400 });

  const user = await userForSupabaseAccessToken(accessToken);
  if (!user) return NextResponse.json({ ok:false, error:"invalid_supabase_session" }, { status:401 });
  const owner = identifyConfiguredOwner(user);
  if (!owner) return NextResponse.json({ ok:false, error:"owner_not_authorized" }, { status:403 });

  const response = NextResponse.json({ ok:true, owner });
  response.cookies.set("rmf_owner_access", accessToken, {
    httpOnly:true,
    secure:true,
    sameSite:"lax",
    path:"/",
    maxAge:3600
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok:true, signed_out:true });
  response.cookies.set("rmf_owner_access", "", {
    httpOnly:true,
    secure:true,
    sameSite:"lax",
    path:"/",
    maxAge:0
  });
  return response;
}
