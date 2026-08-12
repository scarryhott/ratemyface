import { databaseConfigured, db } from "./db";

export async function getOperatorOpsRead() {
  if (!databaseConfigured()) {
    return {
      ok: true,
      database_configured: false,
      generated_at: new Date().toISOString(),
      counts: { projects: 0, runs: 0, signals: 0, ledger: 0, gpts: 0, receipts: 0, approvals_pending: 0, approvals_total: 0 },
      projects: [], recent_runs: [], recent_signals: [], recent_ledger: [], gpts: [], recent_receipts: [], recent_approvals: [],
      external_metrics: {
        amazon_associates: { status: "connect_later", note: "Amazon Associates click/commission metrics are not stored in rmf_* yet." },
        vercel_analytics: { status: "connect_later", note: "Vercel analytics/runtime metrics are not stored in rmf_* yet." },
        railway_browser: { status: process.env.RMF_BROWSER_CONTROL_URL ? "configured" : "connect_later", note: process.env.RMF_BROWSER_CONTROL_URL ? "Browser control URL is configured; live Railway metrics are not ingested into Postgres yet." : "Railway browser control is not configured." }
      }
    };
  }

  const sql = db();
  return await sql.begin(async (tx) => {
    await tx`set local statement_timeout = '3000ms'`;
    await tx`set local lock_timeout = '1500ms'`;

    const projectCount = await tx`select count(*)::int as total from rmf_agent_projects`;
    const runCount = await tx`select count(*)::int as total from rmf_agent_runs`;
    const signalCount = await tx`select count(*)::int as total from rmf_agent_signals`;
    const ledgerCount = await tx`select count(*)::int as total from rmf_agent_ledger`;
    const gptCount = await tx`select count(*)::int as total from rmf_agent_gpts`;
    const receiptCount = await tx`select count(*)::int as total from rmf_agent_receipts`;
    const pendingApprovalCount = await tx`select count(*)::int as total from rmf_agent_approvals where status='pending'`;
    const approvalCount = await tx`select count(*)::int as total from rmf_agent_approvals`;

    const projects = await tx`select id, slug, name, repository, vercel_project_id, status, updated_at from rmf_agent_projects order by id limit 50`;
    const recentRuns = await tx`select id, signal_id, model, authority, status, harness, closure_state, error, created_at, completed_at from rmf_agent_runs order by created_at desc limit 15`;
    const recentSignals = await tx`select id, source, kind, status, requested_authority, created_at, started_at, completed_at from rmf_agent_signals order by created_at desc limit 15`;
    const recentLedger = await tx`select id, run_id, event, capability, authority, admissible, created_at from rmf_agent_ledger order by created_at desc limit 20`;
    const gpts = await tx`select id, project_id, gpt_key, name, platform, status, external_id, updated_at from rmf_agent_gpts order by id limit 50`;
    const recentReceipts = await tx`select id, run_id, tool, authority, verified, external_ref, created_at from rmf_agent_receipts order by created_at desc limit 15`;
    const recentApprovals = await tx`select id, run_id, capability, requested_authority, status, rationale, created_at, decided_at from rmf_agent_approvals order by created_at desc limit 15`;

    return {
      ok: true,
      database_configured: true,
      generated_at: new Date().toISOString(),
      counts: {
        projects: Number(projectCount[0]?.total || 0),
        runs: Number(runCount[0]?.total || 0),
        signals: Number(signalCount[0]?.total || 0),
        ledger: Number(ledgerCount[0]?.total || 0),
        gpts: Number(gptCount[0]?.total || 0),
        receipts: Number(receiptCount[0]?.total || 0),
        approvals_pending: Number(pendingApprovalCount[0]?.total || 0),
        approvals_total: Number(approvalCount[0]?.total || 0)
      },
      projects: projects.map((r: any) => ({ ...r, id: Number(r.id), updated_at: String(r.updated_at) })),
      recent_runs: recentRuns.map((r: any) => ({ ...r, id: Number(r.id), signal_id: r.signal_id == null ? null : Number(r.signal_id), authority: Number(r.authority), error: r.error == null ? null : String(r.error).slice(0, 240), created_at: String(r.created_at), completed_at: r.completed_at == null ? null : String(r.completed_at) })),
      recent_signals: recentSignals.map((r: any) => ({ ...r, id: Number(r.id), requested_authority: Number(r.requested_authority), created_at: String(r.created_at), started_at: r.started_at == null ? null : String(r.started_at), completed_at: r.completed_at == null ? null : String(r.completed_at) })),
      recent_ledger: recentLedger.map((r: any) => ({ ...r, id: Number(r.id), run_id: r.run_id == null ? null : Number(r.run_id), authority: Number(r.authority), admissible: Boolean(r.admissible), created_at: String(r.created_at) })),
      gpts: gpts.map((r: any) => ({ ...r, id: Number(r.id), project_id: r.project_id == null ? null : Number(r.project_id), updated_at: String(r.updated_at) })),
      recent_receipts: recentReceipts.map((r: any) => ({ ...r, id: Number(r.id), run_id: Number(r.run_id), authority: Number(r.authority), verified: Boolean(r.verified), created_at: String(r.created_at) })),
      recent_approvals: recentApprovals.map((r: any) => ({ ...r, id: Number(r.id), run_id: r.run_id == null ? null : Number(r.run_id), requested_authority: Number(r.requested_authority), created_at: String(r.created_at), decided_at: r.decided_at == null ? null : String(r.decided_at) })),
      external_metrics: {
        amazon_associates: { status: "connect_later", note: "Amazon Associates click/commission metrics are not stored in rmf_* yet." },
        vercel_analytics: { status: "connect_later", note: "Vercel analytics/runtime metrics are not stored in rmf_* yet." },
        railway_browser: { status: process.env.RMF_BROWSER_CONTROL_URL ? "configured" : "connect_later", note: process.env.RMF_BROWSER_CONTROL_URL ? "Browser control URL is configured; live Railway metrics are not ingested into Postgres yet." : "Railway browser control is not configured." }
      }
    };
  });
}
