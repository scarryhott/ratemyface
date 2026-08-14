import { NextRequest, NextResponse } from "next/server";
import {
  OPERATOR_READ_TIMEOUT_MS,
  isDatabaseTimeoutError,
  isUndefinedTableError,
  withDatabaseTimeout
} from "../../../../../lib/db";
import { operatorRequestAuthorized } from "../../../../../lib/operatorOwnerAuth";
import { registerUnifiedFeature } from "../../../../../lib/unifiedControlPlane";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }

  try {
    const feature = await withDatabaseTimeout(
      () => registerUnifiedFeature(input as Record<string, unknown>, auth.actor || "operator"),
      OPERATOR_READ_TIMEOUT_MS
    );
    return NextResponse.json({ ok: true, feature, actor: auth.actor }, { status: 201 });
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json({ ok: false, error: "database_timeout" }, { status: 504 });
    }
    if (isUndefinedTableError(error)) {
      return NextResponse.json({ ok: false, error: "control_plane_schema_not_ready" }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : String(error);
    const status = /_(invalid|required)$/.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
