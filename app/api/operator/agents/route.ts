import { NextRequest, NextResponse } from "next/server";
import {
  buildFeatureBacklogConsole,
  readStrategyReports,
  realizeFeatureBacklogConsole,
  snapshotBusinessFlags,
  snapshotBusinessMetrics
} from "../../../../lib/agentBusinessLoop";
import {
  OPERATOR_READ_TIMEOUT_MS,
  databaseConfigured,
  db,
  isDatabaseTimeoutError,
  isUndefinedTableError,
  withDatabaseTimeout
} from "../../../../lib/db";
import { getOperatorToolRegistry } from "../../../../lib/operatorTools";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";
/** Platform backstop only — the handler must still fail fast via withDatabaseTimeout. */
export const maxDuration = 30;

function harnessPayload() {
  return {
    version: "closure-native-v1",
    max_authority: Number(process.env.RMF_OPERATOR_MAX_AUTHORITY || 1),
    model: process.env.RMF_OPERATOR_MODEL || "openai/gpt-5.6-terra",
    ai_gateway_configured: Boolean(process.env.AI_GATEWAY_API_KEY),
    tools: getOperatorToolRegistry()
  };
}

function unavailableAgentsPayload(
  auth: { actor?: string; owner?: unknown },
  reason: string,
  timeoutMs?: number
) {
  const metrics = snapshotBusinessFlags();
  return {
    ok: true,
    actor: auth.actor,
    owner: auth.owner || null,
    database_configured: databaseConfigured(),
    counts_available: false,
    ops_read_error: reason,
    timeout_ms: timeoutMs,
    generated_at: new Date().toISOString(),
    metrics,
    strategy: { latest: null, history: [] },
    queue: {
      signals_queued: null,
      pending_approvals: null,
      runs_7d: null,
      available: false,
      note: "UNAVAILABLE — operator read timed out. These are not live zeros."
    },
    backlog: buildFeatureBacklogConsole([]),
    recent_signals: null,
    recent_runs: null,
    pending_approvals: null,
    harness: harnessPayload(),
    commercial_loop: metrics.commercial_loop
  };
}

/** Agent management + strategy impact payload for Dashboard Agent Console. */
export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (!databaseConfigured()) {
    const metrics = snapshotBusinessFlags();
    return NextResponse.json({
      ok: true,
      actor: auth.actor,
      owner: auth.owner || null,
      database_configured: false,
      counts_available: false,
      ops_read_error: "database_not_configured",
      metrics,
      strategy: { latest: null, history: [] },
      queue: {
        signals_queued: null,
        pending_approvals: null,
        runs_7d: null,
        available: false,
        note: "UNAVAILABLE — database not configured"
      },
      backlog: buildFeatureBacklogConsole([]),
      recent_signals: null,
      recent_runs: null,
      pending_approvals: null,
      harness: harnessPayload()
    });
  }

  try {
    return await withDatabaseTimeout(async () => {
      const sql = db();
      const [queued, approvalsPending, runs7d, signals, runs, approvals, strategy, metrics, backlog] =
        await Promise.all([
          sql`select count(*)::int as total from rmf_agent_signals where status='queued'`,
          sql`select count(*)::int as total from rmf_agent_approvals where status='pending'`,
          sql`select count(*)::int as total from rmf_agent_runs where created_at >= now() - interval '7 days'`,
          sql`
            select id, source, kind, status, requested_authority, attempt_count, fail_reason, created_at, completed_at
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
          snapshotBusinessMetrics(),
          realizeFeatureBacklogConsole()
        ]);

      return NextResponse.json({
        ok: true,
        actor: auth.actor,
        owner: auth.owner || null,
        database_configured: true,
        counts_available: true,
        generated_at: new Date().toISOString(),
        metrics,
        strategy,
        backlog,
        queue: {
          signals_queued: Number(queued[0]?.total || 0),
          pending_approvals: Number(approvalsPending[0]?.total || 0),
          runs_7d: Number(runs7d[0]?.total || 0),
          available: true,
          note: "Ops activity — not feature progress"
        },
        recent_signals: signals,
        recent_runs: runs,
        pending_approvals: approvals,
        harness: harnessPayload(),
        commercial_loop: metrics.commercial_loop
      });
    }, OPERATOR_READ_TIMEOUT_MS);
  } catch (error) {
    if (isDatabaseTimeoutError(error) || isUndefinedTableError(error)) {
      const reason = isUndefinedTableError(error) ? "schema_not_ready" : "database_timeout";
      return NextResponse.json(
        unavailableAgentsPayload(auth, reason, isDatabaseTimeoutError(error) ? OPERATOR_READ_TIMEOUT_MS : undefined)
      );
    }
    throw error;
  }
}
