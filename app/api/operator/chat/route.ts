import { NextRequest, NextResponse } from "next/server";
import {
  businessImproveGoal,
  snapshotBusinessMetrics
} from "../../../../lib/agentBusinessLoop";
import { enqueueSignal, runOneSignal } from "../../../../lib/operatorAgent";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Owner chat with the operator agent from the dashboard.
 * Enqueues an owner_chat signal, optionally runs it immediately, returns a chat-friendly reply.
 */
export async function POST(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const message = String(body.message || body.text || "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ ok: false, error: "message_required" }, { status: 400 });

  const runNow = body.run_now !== false;
  const authority = Math.max(0, Math.min(6, Number(body.requested_authority ?? 1))) as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;

  const metrics_snapshot = await snapshotBusinessMetrics();
  const signal = await enqueueSignal(
    auth.actor || "owner-dashboard-chat",
    "owner_chat",
    {
      message,
      goal: "Answer the owner in the Agent Console and recommend the highest-value admissible next business step.",
      metrics_snapshot,
      commercial_loop: metrics_snapshot.commercial_loop,
      dashboard: "/operator/dashboard#agents"
    },
    authority
  );

  let run: any = null;
  if (runNow) {
    try {
      run = await runOneSignal();
    } catch (error: any) {
      return NextResponse.json(
        {
          ok: false,
          error: String(error?.message || error),
          signal,
          actor: auth.actor
        },
        { status: 500 }
      );
    }
  }

  const reply =
    run?.plan?.summary ||
    (run?.idle
      ? "No queued signal was available to run."
      : runNow
        ? "Agent run finished without a summary."
        : "Message queued. Use Run next to process.");

  return NextResponse.json({
    ok: true,
    actor: auth.actor,
    signal,
    run,
    chat: {
      role: "assistant",
      content: reply,
      observations: run?.plan?.observations || [],
      business_impact: run?.plan?.business_impact || run?.strategy_report || null,
      status: run?.status || (runNow ? "unknown" : "queued"),
      run_id: run?.run_id || null
    }
  });
}

/** Queue an autonomous business improve cycle (same shape as cron heartbeat, owner-triggered). */
export async function PUT(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const runNow = body.run_now !== false;
  const metrics_snapshot = await snapshotBusinessMetrics();
  const signal = await enqueueSignal(
    auth.actor || "owner-dashboard",
    "business_improve",
    {
      goal: businessImproveGoal(),
      metrics_snapshot,
      commercial_loop: metrics_snapshot.commercial_loop,
      dashboard: "/operator/dashboard#agents"
    },
    1
  );

  let run: any = null;
  if (runNow) {
    try {
      run = await runOneSignal();
    } catch (error: any) {
      return NextResponse.json(
        { ok: false, error: String(error?.message || error), signal, actor: auth.actor },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    actor: auth.actor,
    signal,
    run,
    strategy_report: run?.strategy_report || null,
    note: "Autonomous improve cycle queued/run. Strategy impact is stored for the dashboard Agent Console."
  });
}
