import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";
import { getEntitlements } from "../../../../lib/stripeBilling";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  }
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  const entitlements = await getEntitlements(user.id);
  return NextResponse.json({
    ok: true,
    plan: entitlements.premium ? "premium" : "free",
    ...entitlements
  });
}
