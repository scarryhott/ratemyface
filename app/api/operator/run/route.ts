import { NextRequest, NextResponse } from "next/server";
import {
  OPERATOR_WORKER_DB_TIMEOUT_MS,
  OPERATOR_WORKER_TIMEOUT_MS,
  isDatabaseTimeoutError,
  isUndefinedTableError,
  isWorkerTimeoutError,
  withWorkerTimeout
} from "../../../../lib/db";
import { runOneSignal } from "../../../../lib/operatorAgent";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";
/** Platform backstop only — the handler must still fail fast via withWorkerTimeout. */
export const maxDuration = 60;

function timeoutJson(error: "database_timeout" | "worker_timeout", timeoutMs: number) {
  return NextResponse.json(
    { ok: false, error, timeout_ms: timeoutMs },
    { status: 504 }
  );
}

export async function POST(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request, { allowCron: true });
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const result = await withWorkerTimeout(() => runOneSignal(), OPERATOR_WORKER_TIMEOUT_MS);
    return NextResponse.json({ ...result, actor: auth.actor });
  } catch (error: unknown) {
    if (isWorkerTimeoutError(error)) {
      return timeoutJson("worker_timeout", OPERATOR_WORKER_TIMEOUT_MS);
    }
    if (isDatabaseTimeoutError(error)) {
      return timeoutJson("database_timeout", OPERATOR_WORKER_DB_TIMEOUT_MS);
    }
    if (isUndefinedTableError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "schema_not_ready",
          message: "Agent tables are not ready. Worker does not run unbounded schema DDL."
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: String((error as { message?: string })?.message || error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
