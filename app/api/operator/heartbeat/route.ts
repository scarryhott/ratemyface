import { NextRequest, NextResponse } from "next/server";
import {
  businessImproveGoal,
  snapshotBusinessMetrics
} from "../../../../lib/agentBusinessLoop";
import { enqueueSignal, runOneSignal } from "../../../../lib/operatorAgent";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily autonomous business improve heartbeat.
 * Snapshots metrics → queues business_improve → runs one signal → strategy report lands on dashboard.
 */
export async function GET(request: NextRequest) {
  const cron = process.env.CRON_SECRET;
  if (!cron || request.headers.get("authorization") !== `Bearer ${cron}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const metrics_snapshot = await snapshotBusinessMetrics();
  await enqueueSignal(
    "vercel-cron",
    "business_improve",
    {
      goal: businessImproveGoal(),
      metrics_snapshot,
      commercial_loop: metrics_snapshot.commercial_loop,
      dashboard: "/operator/dashboard#agents",
      heartbeat: true
    },
    1
  );

  try {
    const run = await runOneSignal();
    return NextResponse.json({
      ok: true,
      heartbeat: true,
      kind: "business_improve",
      metrics_snapshot,
      run,
      strategy_report: run?.strategy_report || null
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
