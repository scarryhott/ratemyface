import { NextRequest, NextResponse } from "next/server";
import { operatorOwnerFromRequest } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const owner = await operatorOwnerFromRequest(request);
  if (!owner) return NextResponse.json({ ok:false, error:"not_authenticated_or_not_authorized" }, { status:401 });
  return NextResponse.json({ ok:true, owner });
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
