import { NextRequest, NextResponse } from "next/server";
import { heartbeatIdempotencyKey } from "../../../../lib/agentFeatureBacklog";
import { businessImproveGoal, snapshotBusinessFlags } from "../../../../lib/agentBusinessLoop";
import {
  HEARTBEAT_DB_TIMEOUT_MS,
  databaseConfigured,
  isDatabaseTimeoutError,
  isUndefinedTableError,
  withDatabaseTimeout
} from "../../../../lib/db";
import { enqueueSignalIdempotent } from "../../../../lib/operatorAgent";

export const runtime = "nodejs";
/** Platform backstop only — the handler must still fail fast via withDatabaseTimeout. */
export const maxDuration = 10;

/**
 * Daily heartbeat is a short idempotent enqueue.
 * cron → flag snapshot → enqueue business_improve → 200/202 in under 10s.
 * Worker GET/POST /api/operator/run executes the queued signal separately.
 * Heartbeat success is not feature progress.
 */
export async function GET(request: NextRequest) {
  const cron = process.env.CRON_SECRET;
  if (!cron || request.headers.get("authorization") !== `Bearer ${cron}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const metrics_snapshot = snapshotBusinessFlags();
  const idempotency_key = heartbeatIdempotencyKey();

  if (!databaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        heartbeat: true,
        feature_progress: false,
        error: "database_not_configured",
        idempotency_key,
        metrics_snapshot
      },
      { status: 503 }
    );
  }

  try {
    const signal = await withDatabaseTimeout(async () => {
      return enqueueSignalIdempotent(
        "vercel-cron",
        "business_improve",
        {
          goal: businessImproveGoal(),
          metrics_snapshot,
          commercial_loop: metrics_snapshot.commercial_loop,
          dashboard: "/operator/dashboard#agents",
          heartbeat: true,
          feature_progress: false
        },
        2,
        idempotency_key
      );
    }, HEARTBEAT_DB_TIMEOUT_MS);

    return NextResponse.json(
      {
        ok: true,
        heartbeat: true,
        accepted: !signal.duplicate,
        duplicate: Boolean(signal.duplicate),
        feature_progress: false,
        kind: "business_improve",
        idempotency_key,
        signal,
        metrics_snapshot,
        note: "Heartbeat enqueued a build cycle. Worker /api/operator/run executes it. Heartbeat success is not feature progress."
      },
      { status: signal.duplicate ? 200 : 202 }
    );
  } catch (error: unknown) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json(
        {
          ok: false,
          heartbeat: true,
          feature_progress: false,
          error: "database_timeout",
          timeout_ms: HEARTBEAT_DB_TIMEOUT_MS,
          idempotency_key
        },
        { status: 504 }
      );
    }
    if (isUndefinedTableError(error)) {
      return NextResponse.json(
        {
          ok: false,
          heartbeat: true,
          feature_progress: false,
          error: "schema_not_ready",
          message: "Agent tables are not ready. Heartbeat does not run schema DDL.",
          idempotency_key
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, heartbeat: true, feature_progress: false, error: String((error as any)?.message || error) },
      { status: 500 }
    );
  }
}
