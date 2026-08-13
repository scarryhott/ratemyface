import { NextRequest, NextResponse } from "next/server";
import {
  OPERATOR_READ_TIMEOUT_MS,
  isDatabaseTimeoutError,
  withDatabaseTimeout
} from "../../../../lib/db";
import {
  getOperatorDashboardV2,
  getUnavailableOperatorDashboard
} from "../../../../lib/operatorDashboardRead";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";
/** Platform backstop only — the handler must still fail fast via withDatabaseTimeout. */
export const maxDuration = 30;

/** Dashboard v2 business controller payload (owner/operator auth required). */
export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const dashboard = await withDatabaseTimeout(
      () => getOperatorDashboardV2(),
      OPERATOR_READ_TIMEOUT_MS
    );
    return NextResponse.json({
      ...dashboard,
      actor: auth.actor,
      owner: auth.owner || null
    });
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      const dashboard = getUnavailableOperatorDashboard("database_timeout");
      return NextResponse.json({
        ...dashboard,
        actor: auth.actor,
        owner: auth.owner || null,
        timeout_ms: OPERATOR_READ_TIMEOUT_MS
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
