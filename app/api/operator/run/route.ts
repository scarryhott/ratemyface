import { NextRequest, NextResponse } from "next/server";
import { DB_OPERATION_TIMEOUT_MS, isDatabaseTimeoutError } from "../../../../lib/db";
import { runOneSignal } from "../../../../lib/operatorAgent";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request, { allowCron: true });
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ...(await runOneSignal()), actor: auth.actor });
  } catch (error: unknown) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json(
        { ok: false, error: "database_timeout", timeout_ms: DB_OPERATION_TIMEOUT_MS },
        { status: 504 }
      );
    }
    return NextResponse.json({ ok: false, error: String((error as { message?: string })?.message || error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
