import { databaseConfigured, db } from "./db";

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getOperatorOpsRead() {
  if (!databaseConfigured()) {
    return {
      ok: true,
      database_configured: false,
      generated_at: new Date().toISOString(),
      counts: { projects: 0, runs: 0, signals: 0, ledger: 0, gpts: 0, receipts: 0, approvals_pending: 0, approvals_total: 0 },
      accounts: { auth_users: 0, oauth_users: 0, active_oauth_tokens: 0 },
      portfolio: { active_gpts: 0, draft_gpts: 0, public_gpts: 0, action_gpts: 0, amazon_linked_gpts: 0 },
      commerce: { amazon: null },
      projects: [], recent_runs: [], recent_signals: [], recent_ledger: [], gpts: [], recent_receipts: [], recent_approvals: [],
      external_metrics: {
        amazon_associates: { status: "snapshot_unavailable", note: "No stored Amazon Associates snapshot is available." },
        vercel_analytics: { status: "connect_later", note: "Live Vercel analytics are not persisted in Postgres yet." },
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

    const authUsers = await tx`select count(*)::int as total from auth.users`;
    const oauthStats = await tx`
      select
        count(distinct user_id)::int as users,
        count(*) filter (where revoked_at is null and expires_at > now())::int as active_tokens
      from rmf_oauth_tokens
    `;
    const portfolioStats = await tx`
      select
        count(*) filter (where status='active')::int as active_gpts,
        count(*) filter (where status='draft')::int as draft_gpts,
        count(*) filter (where config->>'visibility'='public')::int as public_gpts,
        count(*) filter (where coalesce((config->>'actions')::boolean,false))::int as action_gpts,
        count(*) filter (where coalesce((config->>'amazon_links')::boolean,false))::int as amazon_linked_gpts
      from rmf_agent_gpts
    `;
    const amazonSnapshot = await tx`
      select value, updated_at
      from rmf_agent_context
      where key='amazon_associates:ratemyface0a-20:last_30_days'
      limit 1
    `;

    const projects = await tx`select id, slug, name, repository, vercel_project_id, status, updated_at from rmf_agent_projects order by id limit 50`;
    const recentRuns = await tx`select id, signal_id, model, authority, status, harness, closure_state, error, created_at, completed_at from rmf_agent_runs order by created_at desc limit 15`;
    const recentSignals = await tx`select id, source, kind, status, requested_authority, created_at, started_at, completed_at from rmf_agent_signals order by created_at desc limit 15`;
    const recentLedger = await tx`select id, run_id, event, capability, authority, admissible, created_at from rmf_agent_ledger order by created_at desc limit 20`;
    const gpts = await tx`select id, project_id, gpt_key, name, platform, status, external_id, config, updated_at from rmf_agent_gpts order by id limit 50`;
    const recentReceipts = await tx`select id, run_id, tool, authority, verified, external_ref, created_at from rmf_agent_receipts order by created_at desc limit 15`;
    const recentApprovals = await tx`select id, run_id, capability, requested_authority, status, rationale, created_at, decided_at from rmf_agent_approvals order by created_at desc limit 15`;

    const amazon = amazonSnapshot[0]
      ? { ...(amazonSnapshot[0].value as Record<string, unknown>), snapshot_updated_at: String(amazonSnapshot[0].updated_at) }
      : null;

    return {
      ok: true,
      database_configured: true,
      generated_at: new Date().toISOString(),
      counts: {
        projects: asNumber(projectCount[0]?.total),
        runs: asNumber(runCount[0]?.total),
        signals: asNumber(signalCount[0]?.total),
        ledger: asNumber(ledgerCount[0]?.total),
        gpts: asNumber(gptCount[0]?.total),
        receipts: asNumber(receiptCount[0]?.total),
        approvals_pending: asNumber(pendingApprovalCount[0]?.total),
        approvals_total: asNumber(approvalCount[0]?.total)
      },
      accounts: {
        auth_users: asNumber(authUsers[0]?.total),
        oauth_users: asNumber(oauthStats[0]?.users),
        active_oauth_tokens: asNumber(oauthStats[0]?.active_tokens)
      },
      portfolio: {
        active_gpts: asNumber(portfolioStats[0]?.active_gpts),
        draft_gpts: asNumber(portfolioStats[0]?.draft_gpts),
        public_gpts: asNumber(portfolioStats[0]?.public_gpts),
        action_gpts: asNumber(portfolioStats[0]?.action_gpts),
        amazon_linked_gpts: asNumber(portfolioStats[0]?.amazon_linked_gpts)
      },
      commerce: { amazon },
      projects: projects.map((r: any) => ({ ...r, id: Number(r.id), updated_at: String(r.updated_at) })),
      recent_runs: recentRuns.map((r: any) => ({ ...r, id: Number(r.id), signal_id: r.signal_id == null ? null : Number(r.signal_id), authority: Number(r.authority), error: r.error == null ? null : String(r.error).slice(0, 240), created_at: String(r.created_at), completed_at: r.completed_at == null ? null : String(r.completed_at) })),
      recent_signals: recentSignals.map((r: any) => ({ ...r, id: Number(r.id), requested_authority: Number(r.requested_authority), created_at: String(r.created_at), started_at: r.started_at == null ? null : String(r.started_at), completed_at: r.completed_at == null ? null : String(r.completed_at) })),
      recent_ledger: recentLedger.map((r: any) => ({ ...r, id: Number(r.id), run_id: r.run_id == null ? null : Number(r.run_id), authority: Number(r.authority), admissible: Boolean(r.admissible), created_at: String(r.created_at) })),
      gpts: gpts.map((r: any) => ({ ...r, id: Number(r.id), project_id: r.project_id == null ? null : Number(r.project_id), config: r.config || {}, updated_at: String(r.updated_at) })),
      recent_receipts: recentReceipts.map((r: any) => ({ ...r, id: Number(r.id), run_id: Number(r.run_id), authority: Number(r.authority), verified: Boolean(r.verified), created_at: String(r.created_at) })),
      recent_approvals: recentApprovals.map((r: any) => ({ ...r, id: Number(r.id), run_id: r.run_id == null ? null : Number(r.run_id), requested_authority: Number(r.requested_authority), created_at: String(r.created_at), decided_at: r.decided_at == null ? null : String(r.decided_at) })),
      external_metrics: {
        amazon_associates: amazon
          ? { status: "snapshot", note: `Stored Amazon Associates snapshot through ${String((amazon as any).period_end || "unknown date")}.` }
          : { status: "snapshot_unavailable", note: "No stored Amazon Associates snapshot is available." },
        vercel_analytics: { status: "connect_later", note: "Live Vercel analytics are not persisted in Postgres yet." },
        railway_browser: { status: process.env.RMF_BROWSER_CONTROL_URL ? "configured" : "connect_later", note: process.env.RMF_BROWSER_CONTROL_URL ? "Browser control URL is configured; live Railway metrics are not ingested into Postgres yet." : "Railway browser control is not configured." }
      }
    };
  });
}
