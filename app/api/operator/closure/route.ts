import { NextRequest, NextResponse } from "next/server";
import { OPERATOR_READ_TIMEOUT_MS, isDatabaseTimeoutError, withDatabaseTimeout } from "../../../../lib/db";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";
import { safeComputeClosureRuntimeRound } from "../../../../lib/closureRuntimeStore";

export const runtime = "nodejs";
export const maxDuration = 30;

type ResponseMode = "preview" | "persist" | "cron";

async function respond(request: NextRequest, mode: ResponseMode) {
  const auth = await operatorRequestAuthorized(request, { allowCron: mode !== "preview" });
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const persist = mode === "persist" || (mode === "cron" && auth.actor === "vercel-cron");
  try {
    const round = await withDatabaseTimeout(
      () => safeComputeClosureRuntimeRound({ persist }),
      OPERATOR_READ_TIMEOUT_MS
    );
    if (!round) return NextResponse.json({ ok: false, error: "control_plane_schema_not_ready" }, { status: 503 });
    return NextResponse.json({ ok: true, persisted: persist, round, actor: auth.actor });
  } catch (error) {
    if (isDatabaseTimeoutError(error)) return NextResponse.json({ ok: false, error: "database_timeout" }, { status: 504 });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** Read-only preview of the next admitted closure task. */
export async function GET(request: NextRequest) {
  return respond(request, "cron");
}

/** Persist a changed closure cursor and its bounded builder capsule. */
export async function POST(request: NextRequest) {
  return respond(request, "persist");
}
