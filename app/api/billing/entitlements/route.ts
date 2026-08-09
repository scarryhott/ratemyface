import { NextRequest, NextResponse } from "next/server";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";
import { getEntitlements } from "../../../../lib/stripeBilling";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  }

  const entitlements = await getEntitlements(user.id);
  return NextResponse.json({
    ok: true,
    plan: entitlements.premium ? "premium" : "free",
    ...entitlements
  });
}
