import { NextRequest, NextResponse } from "next/server";
import { getOperatorDashboardV2 } from "../../../../lib/operatorDashboardRead";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Dashboard v2 business controller payload (owner/operator auth required). */
export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const dashboard = await getOperatorDashboardV2();
    return NextResponse.json({
      ...dashboard,
      actor: auth.actor,
      owner: auth.owner || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
