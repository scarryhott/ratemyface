import { databaseConfigured, db } from "./db";
import { ensureOperatorSchema } from "./operatorAgent";

export type OpsCountRow = { total: number };

export type OpsOverview = {
  ok: true;
  database_configured: boolean;
  generated_at: string;
  counts: {
    projects: number;
    runs: number;
    signals: number;
    ledger: number;
    gpts: number;
    receipts: number;
    approvals_pending: number;
    approvals_total: number;
  };
  projects: Array<{
    id: number;
    slug: string;
    name: string;
    repository: string | null;
    vercel_project_id: string | null;
    status: string;
    updated_at: string;
  }>;
  recent_runs: Array<{
    id: number;
    signal_id: number | null;
    model: string | null;
    authority: number;
    status: string;
    harness: string | null;
    closure_state: string | null;
    error: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
  recent_signals: Array<{
    id: number;
    source: string;
    kind: string;
    status: string;
    requested_authority: number;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  }>;
  recent_ledger: Array<{
    id: number;
    run_id: number | null;
    event: string;
    capability: string | null;
    authority: number;
    admissible: boolean;
    created_at: string;
  }>;
  gpts: Array<{
    id: number;
    project_id: number | null;
    gpt_key: string;
    name: string;
    platform: string;
    status: string;
    external_id: string | null;
    updated_at: string;
  }>;
  recent_receipts: Array<{
    id: number;
    run_id: number;
    tool: string;
    authority: number;
    verified: boolean;
    external_ref: string | null;
    created_at: string;
  }>;
  recent_approvals: Array<{
    id: number;
    run_id: number | null;
    capability: string;
    requested_authority: number;
    status: string;
    rationale: string | null;
    created_at: string;
    decided_at: string | null;
  }>;
  external_metrics: {
    amazon_associates: { status: "connect_later"; note: string };
    vercel_analytics: { status: "connect_later"; note: string };
    railway_browser: { status: "connect_later" | "configured"; note: string };
  };
};

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function asNullableIso(value: unknown): string | null {
  if (value == null) return null;
  return asIso(value);
}

function truncateError(value: unknown, max = 240): string | null {
  if (value == null) return null;
  const text = String(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export async function getOperatorOpsOverview(): Promise<OpsOverview> {
  if (!databaseConfigured()) {
    return {
      ok: true,
      database_configured: false,
      generated_at: new Date().toISOString(),
      counts: {
        projects: 0,
        runs: 0,
        signals: 0,
        ledger: 0,
        gpts: 0,
        receipts: 0,
        approvals_pending: 0,
        approvals_total: 0
      },
      projects: [],
      recent_runs: [],
      recent_signals: [],
      recent_ledger: [],
      gpts: [],
      recent_receipts: [],
      recent_approvals: [],
      external_metrics: {
        amazon_associates: {
          status: "connect_later",
          note: "Amazon Associates click/commission metrics are not stored in rmf_* yet."
        },
        vercel_analytics: {
          status: "connect_later",
          note: "Vercel analytics/runtime metrics are not stored in rmf_* yet."
        },
        railway_browser: {
          status: process.env.RMF_BROWSER_CONTROL_URL ? "configured" : "connect_later",
          note: process.env.RMF_BROWSER_CONTROL_URL
            ? "Browser control URL is configured; live Railway metrics are not ingested into Postgres yet."
            : "Railway browser control is not configured."
        }
      }
    };
  }

  await ensureOperatorSchema();
  const sql = db();

  const [
    projectCount,
    runCount,
    signalCount,
    ledgerCount,
    gptCount,
    receiptCount,
    pendingApprovalCount,
    approvalCount,
    projects,
    recentRuns,
    recentSignals,
    recentLedger,
    gpts,
    recentReceipts,
    recentApprovals
  ] = await Promise.all([
    sql<OpsCountRow[]>`select count(*)::int as total from rmf_agent_projects`,
    sql<OpsCountRow[]>`select count(*)::int as total from rmf_agent_runs`,
    sql<OpsCountRow[]>`select count(*)::int as total from rmf_agent_signals`,
    sql<OpsCountRow[]>`select count(*)::int as total from rmf_agent_ledger`,
    sql<OpsCountRow[]>`select count(*)::int as total from rmf_agent_gpts`,
    sql<OpsCountRow[]>`select count(*)::int as total from rmf_agent_receipts`,
    sql<OpsCountRow[]>`select count(*)::int as total from rmf_agent_approvals where status='pending'`,
    sql<OpsCountRow[]>`select count(*)::int as total from rmf_agent_approvals`,
    sql`
      select id, slug, name, repository, vercel_project_id, status, updated_at
      from rmf_agent_projects
      order by id
      limit 50
    `,
    sql`
      select id, signal_id, model, authority, status, harness, closure_state, error, created_at, completed_at
      from rmf_agent_runs
      order by created_at desc
      limit 15
    `,
    sql`
      select id, source, kind, status, requested_authority, created_at, started_at, completed_at
      from rmf_agent_signals
      order by created_at desc
      limit 15
    `,
    sql`
      select id, run_id, event, capability, authority, admissible, created_at
      from rmf_agent_ledger
      order by created_at desc
      limit 20
    `,
    sql`
      select id, project_id, gpt_key, name, platform, status, external_id, updated_at
      from rmf_agent_gpts
      order by id
      limit 50
    `,
    sql`
      select id, run_id, tool, authority, verified, external_ref, created_at
      from rmf_agent_receipts
      order by created_at desc
      limit 15
    `,
    sql`
      select id, run_id, capability, requested_authority, status, rationale, created_at, decided_at
      from rmf_agent_approvals
      order by created_at desc
      limit 15
    `
  ]);

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
    projects: projects.map((row) => ({
      id: Number(row.id),
      slug: String(row.slug),
      name: String(row.name),
      repository: row.repository == null ? null : String(row.repository),
      vercel_project_id: row.vercel_project_id == null ? null : String(row.vercel_project_id),
      status: String(row.status),
      updated_at: asIso(row.updated_at)
    })),
    recent_runs: recentRuns.map((row) => ({
      id: Number(row.id),
      signal_id: row.signal_id == null ? null : Number(row.signal_id),
      model: row.model == null ? null : String(row.model),
      authority: Number(row.authority),
      status: String(row.status),
      harness: row.harness == null ? null : String(row.harness),
      closure_state: row.closure_state == null ? null : String(row.closure_state),
      error: truncateError(row.error),
      created_at: asIso(row.created_at),
      completed_at: asNullableIso(row.completed_at)
    })),
    recent_signals: recentSignals.map((row) => ({
      id: Number(row.id),
      source: String(row.source),
      kind: String(row.kind),
      status: String(row.status),
      requested_authority: Number(row.requested_authority),
      created_at: asIso(row.created_at),
      started_at: asNullableIso(row.started_at),
      completed_at: asNullableIso(row.completed_at)
    })),
    recent_ledger: recentLedger.map((row) => ({
      id: Number(row.id),
      run_id: row.run_id == null ? null : Number(row.run_id),
      event: String(row.event),
      capability: row.capability == null ? null : String(row.capability),
      authority: Number(row.authority),
      admissible: Boolean(row.admissible),
      created_at: asIso(row.created_at)
    })),
    gpts: gpts.map((row) => ({
      id: Number(row.id),
      project_id: row.project_id == null ? null : Number(row.project_id),
      gpt_key: String(row.gpt_key),
      name: String(row.name),
      platform: String(row.platform),
      status: String(row.status),
      external_id: row.external_id == null ? null : String(row.external_id),
      updated_at: asIso(row.updated_at)
    })),
    recent_receipts: recentReceipts.map((row) => ({
      id: Number(row.id),
      run_id: Number(row.run_id),
      tool: String(row.tool),
      authority: Number(row.authority),
      verified: Boolean(row.verified),
      external_ref: row.external_ref == null ? null : String(row.external_ref),
      created_at: asIso(row.created_at)
    })),
    recent_approvals: recentApprovals.map((row) => ({
      id: Number(row.id),
      run_id: row.run_id == null ? null : Number(row.run_id),
      capability: String(row.capability),
      requested_authority: Number(row.requested_authority),
      status: String(row.status),
      rationale: row.rationale == null ? null : String(row.rationale),
      created_at: asIso(row.created_at),
      decided_at: asNullableIso(row.decided_at)
    })),
    external_metrics: {
      amazon_associates: {
        status: "connect_later",
        note: "Amazon Associates click/commission metrics are not stored in rmf_* yet."
      },
      vercel_analytics: {
        status: "connect_later",
        note: "Vercel analytics/runtime metrics are not stored in rmf_* yet."
      },
      railway_browser: {
        status: process.env.RMF_BROWSER_CONTROL_URL ? "configured" : "connect_later",
        note: process.env.RMF_BROWSER_CONTROL_URL
          ? "Browser control URL is configured; live Railway metrics are not ingested into Postgres yet."
          : "Railway browser control is not configured."
      }
    }
  };
}
