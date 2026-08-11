import { NextRequest, NextResponse } from "next/server";
import { getOperatorOpsOverview } from "../../../../lib/operatorOps";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const overview = await getOperatorOpsOverview();
    return NextResponse.json({
      ...overview,
      actor: auth.actor,
      owner: auth.owner || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
