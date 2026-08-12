import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, db } from "../../../../lib/db";
import {
  readStrategyReports,
  snapshotBusinessMetrics
} from "../../../../lib/agentBusinessLoop";
import { ensureOperatorSchema } from "../../../../lib/operatorAgent";
import { getOperatorToolRegistry } from "../../../../lib/operatorTools";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

/** Agent management + strategy impact payload for Dashboard Agent Console. */
export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (!databaseConfigured()) {
    return NextResponse.json({
      ok: true,
      actor: auth.actor,
      owner: auth.owner || null,
      database_configured: false,
      metrics: await snapshotBusinessMetrics(),
      strategy: { latest: null, history: [] },
      queue: { signals_queued: 0, pending_approvals: 0, runs_7d: 0 },
      recent_signals: [],
      recent_runs: [],
      pending_approvals: [],
      harness: {
        version: "closure-native-v1",
        max_authority: Number(process.env.RMF_OPERATOR_MAX_AUTHORITY || 1),
        model: process.env.RMF_OPERATOR_MODEL || "openai/gpt-5.6-terra",
        ai_gateway_configured: Boolean(process.env.AI_GATEWAY_API_KEY),
        tools: getOperatorToolRegistry()
      }
    });
  }

  await ensureOperatorSchema();
  const sql = db();
  const [queued, approvalsPending, runs7d, signals, runs, approvals, strategy, metrics] =
    await Promise.all([
      sql`select count(*)::int as total from rmf_agent_signals where status='queued'`,
      sql`select count(*)::int as total from rmf_agent_approvals where status='pending'`,
      sql`select count(*)::int as total from rmf_agent_runs where created_at >= now() - interval '7 days'`,
      sql`
        select id, source, kind, status, requested_authority, created_at, completed_at
        from rmf_agent_signals
        order by created_at desc
        limit 15
      `,
      sql`
        select id, signal_id, model, authority, status, closure_state, error, created_at, completed_at,
               plan->>'summary' as plan_summary
        from rmf_agent_runs
        order by created_at desc
        limit 15
      `,
      sql`
        select id, run_id, capability, requested_authority, status, rationale, created_at
        from rmf_agent_approvals
        where status='pending'
        order by created_at desc
        limit 20
      `,
      readStrategyReports(12),
      snapshotBusinessMetrics()
    ]);

  return NextResponse.json({
    ok: true,
    actor: auth.actor,
    owner: auth.owner || null,
    database_configured: true,
    generated_at: new Date().toISOString(),
    metrics,
    strategy,
    queue: {
      signals_queued: Number(queued[0]?.total || 0),
      pending_approvals: Number(approvalsPending[0]?.total || 0),
      runs_7d: Number(runs7d[0]?.total || 0)
    },
    recent_signals: signals,
    recent_runs: runs,
    pending_approvals: approvals,
    harness: {
      version: "closure-native-v1",
      max_authority: Number(process.env.RMF_OPERATOR_MAX_AUTHORITY || 1),
      model: process.env.RMF_OPERATOR_MODEL || "openai/gpt-5.6-terra",
      ai_gateway_configured: Boolean(process.env.AI_GATEWAY_API_KEY),
      tools: getOperatorToolRegistry()
    },
    commercial_loop: metrics.commercial_loop
  });
}
