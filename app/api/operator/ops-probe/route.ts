import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

type Step = { name: string; ok: boolean; latency_ms: number; rows?: number; error?: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sql = db();
  const steps: Step[] = [];
  const started = Date.now();

  try {
    await sql.begin(async (tx) => {
      await tx`set local statement_timeout = '3000ms'`;
      await tx`set local lock_timeout = '1500ms'`;

      const probes: Array<[string, () => Promise<readonly unknown[]>]> = [
        ["projects_count", () => tx`select count(*)::int as total from rmf_agent_projects`],
        ["runs_count", () => tx`select count(*)::int as total from rmf_agent_runs`],
        ["signals_count", () => tx`select count(*)::int as total from rmf_agent_signals`],
        ["ledger_count", () => tx`select count(*)::int as total from rmf_agent_ledger`],
        ["gpts_count", () => tx`select count(*)::int as total from rmf_agent_gpts`],
        ["receipts_count", () => tx`select count(*)::int as total from rmf_agent_receipts`],
        ["approvals_pending_count", () => tx`select count(*)::int as total from rmf_agent_approvals where status='pending'`],
        ["approvals_count", () => tx`select count(*)::int as total from rmf_agent_approvals`],
        ["projects_recent", () => tx`select id, slug, name, repository, vercel_project_id, status, updated_at from rmf_agent_projects order by id limit 50`],
        ["runs_recent", () => tx`select id, signal_id, model, authority, status, harness, closure_state, error, created_at, completed_at from rmf_agent_runs order by created_at desc limit 15`],
        ["signals_recent", () => tx`select id, source, kind, status, requested_authority, created_at, started_at, completed_at from rmf_agent_signals order by created_at desc limit 15`],
        ["ledger_recent", () => tx`select id, run_id, event, capability, authority, admissible, created_at from rmf_agent_ledger order by created_at desc limit 20`],
        ["gpts_recent", () => tx`select id, project_id, gpt_key, name, platform, status, external_id, updated_at from rmf_agent_gpts order by id limit 50`],
        ["receipts_recent", () => tx`select id, run_id, tool, authority, verified, external_ref, created_at from rmf_agent_receipts order by created_at desc limit 15`],
        ["approvals_recent", () => tx`select id, run_id, capability, requested_authority, status, rationale, created_at, decided_at from rmf_agent_approvals order by created_at desc limit 15`]
      ];

      for (const [name, run] of probes) {
        const t0 = Date.now();
        try {
          const rows = await run();
          steps.push({ name, ok: true, latency_ms: Date.now() - t0, rows: rows.length });
        } catch (error) {
          steps.push({ name, ok: false, latency_ms: Date.now() - t0, error: errorMessage(error).slice(0, 300) });
          throw error;
        }
      }
    });

    return NextResponse.json({
      ok: true,
      actor: auth.actor,
      owner: auth.owner?.email || null,
      total_latency_ms: Date.now() - started,
      steps
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      actor: auth.actor,
      owner: auth.owner?.email || null,
      total_latency_ms: Date.now() - started,
      failed_step: steps.find((step) => !step.ok)?.name || null,
      error: errorMessage(error).slice(0, 500),
      steps
    }, { status: 500 });
  }
}
