import { createHash } from "node:crypto";
import { db, DB_OPERATION_TIMEOUT_MS, newSchemaSlot, runOncePerDbClient, withDatabaseTimeout } from "./db";
import { planQueueMaintenance, SIGNAL_MAX_ATTEMPTS, type QueueSignal } from "./operatorQueue";
import {
  classifyCycle,
  decideManagerialAction,
  inspectRepoEvidence,
  managerialPlan,
  type ManagerialDecision
} from "./agentFeatureBacklog";
import {
  appendFeatureReceipt,
  readFeatureReceipts,
  realizeFeatureBacklogConsole,
  receiptFromTool,
  recordStrategyFromRun,
  type BusinessMetricsSnapshot
} from "./agentBusinessLoop";
import {
  normalizeModelPlan,
  resolveClosure,
  type OperatorModelPlan
} from "./operatorClosure";
import {
  executeOperatorTool,
  getOperatorToolRegistry,
  githubRead,
  projectContextRead,
  type Authority,
  type OperatorToolReceipt
} from "./operatorTools";

const schemaSlot = newSchemaSlot();
export type { Authority } from "./operatorTools";

function clampAuthority(value: unknown, fallback: Authority = 1): Authority {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(6, Math.trunc(parsed))) as Authority;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function ensureOperatorSchema(): Promise<void> {
  return runOncePerDbClient(schemaSlot, async () => {
    const sql = db();
    await sql`
      create table if not exists rmf_agent_signals(
        id bigserial primary key,
        source text not null,
        kind text not null default 'signal',
        payload jsonb not null default '{}'::jsonb,
        status text not null default 'queued',
        requested_authority int not null default 1,
        attempt_count int not null default 0,
        fail_reason text,
        created_at timestamptz not null default now(),
        started_at timestamptz,
        completed_at timestamptz
      )
    `;
    await sql`alter table rmf_agent_signals add column if not exists attempt_count int not null default 0`;
    await sql`alter table rmf_agent_signals add column if not exists fail_reason text`;
    await sql`
      create table if not exists rmf_agent_runs(
        id bigserial primary key,
        signal_id bigint references rmf_agent_signals(id),
        model text,
        authority int not null,
        status text not null default 'running',
        context_digest text,
        plan jsonb,
        result jsonb,
        error text,
        created_at timestamptz not null default now(),
        completed_at timestamptz
      )
    `;
    await sql`alter table rmf_agent_runs add column if not exists harness text`;
    await sql`alter table rmf_agent_runs add column if not exists closure_state text`;
    await sql`
      create table if not exists rmf_agent_ledger(
        id bigserial primary key,
        run_id bigint references rmf_agent_runs(id),
        event text not null,
        capability text,
        authority int not null default 0,
        admissible boolean not null default true,
        detail jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists rmf_agent_approvals(
        id bigserial primary key,
        run_id bigint references rmf_agent_runs(id),
        capability text not null,
        requested_authority int not null,
        status text not null default 'pending',
        rationale text,
        created_at timestamptz not null default now(),
        decided_at timestamptz
      )
    `;
    await sql`
      create table if not exists rmf_agent_context(
        key text primary key,
        value jsonb not null,
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists rmf_agent_receipts(
        id bigserial primary key,
        run_id bigint not null references rmf_agent_runs(id) on delete cascade,
        tool text not null,
        authority int not null,
        request_digest text not null,
        expected jsonb not null default '{}'::jsonb,
        observed jsonb not null default '{}'::jsonb,
        verified boolean not null default false,
        rollback_ref text,
        external_ref text,
        detail jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists rmf_agent_projects(
        id bigserial primary key,
        slug text not null unique,
        name text not null,
        repository text,
        vercel_project_id text,
        status text not null default 'active',
        config jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists rmf_agent_gpts(
        id bigserial primary key,
        project_id bigint references rmf_agent_projects(id) on delete cascade,
        gpt_key text not null,
        name text not null,
        platform text not null default 'chatgpt',
        external_id text,
        instructions_ref text,
        action_schema_ref text,
        status text not null default 'planned',
        config jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique(project_id,gpt_key)
      )
    `;
    await sql`create index if not exists rmf_agent_signals_status_idx on rmf_agent_signals(status,created_at)`;
    await sql`create index if not exists rmf_agent_runs_signal_idx on rmf_agent_runs(signal_id,created_at desc)`;
    await sql`create index if not exists rmf_agent_receipts_run_idx on rmf_agent_receipts(run_id,created_at desc)`;

    const repository = process.env.RMF_OPERATOR_GITHUB_REPO || "scarryhott/ratemyface";
    const vercelProjectId = process.env.RMF_OPERATOR_VERCEL_PROJECT_ID || null;
    await sql`
      insert into rmf_agent_projects(slug,name,repository,vercel_project_id,config)
      values('ratemyface','Rate My Face',${repository},${vercelProjectId},${sql.json({ harness: "closure-native-v1" })})
      on conflict(slug) do update set
        repository=excluded.repository,
        vercel_project_id=coalesce(excluded.vercel_project_id,rmf_agent_projects.vercel_project_id),
        updated_at=now()
    `;
  });
}

export async function enqueueSignal(
  source: string,
  kind: string,
  payload: Record<string, unknown>,
  authority: Authority = 1
) {
  await ensureOperatorSchema();
  const sql = db();
  const result = await sql`
    insert into rmf_agent_signals(source,kind,payload,requested_authority)
    values(${source},${kind},${sql.json(payload as any)},${authority})
    returning id,status,requested_authority,created_at
  `;
  return result[0];
}

/**
 * Heartbeat hot path: insert or return the existing signal.
 * Does not run agent-schema DDL. Retries with the same key cannot duplicate.
 */
export async function enqueueSignalIdempotent(
  source: string,
  kind: string,
  payload: Record<string, unknown>,
  authority: Authority,
  idempotencyKey: string
) {
  const sql = db();
  const key = String(idempotencyKey).slice(0, 160);
  const nextPayload = { ...payload, idempotency_key: key };

  const existing = await sql`
    select id, status, requested_authority, created_at
    from rmf_agent_signals
    where payload->>'idempotency_key' = ${key}
    order by created_at desc
    limit 1
  `;
  if (existing[0]) {
    return {
      id: Number(existing[0].id),
      status: String(existing[0].status),
      requested_authority: Number(existing[0].requested_authority),
      created_at: existing[0].created_at,
      duplicate: true,
      idempotency_key: key
    };
  }

  try {
    const claim = await sql`
      insert into rmf_agent_context(key, value, updated_at)
      values(${`idempotency:${key}`}, ${sql.json({ claimed_at: new Date().toISOString() })}, now())
      on conflict(key) do nothing
      returning key
    `;
    if (claim.length === 0) {
      const again = await sql`
        select id, status, requested_authority, created_at
        from rmf_agent_signals
        where payload->>'idempotency_key' = ${key}
        order by created_at desc
        limit 1
      `;
      if (again[0]) {
        return {
          id: Number(again[0].id),
          status: String(again[0].status),
          requested_authority: Number(again[0].requested_authority),
          created_at: again[0].created_at,
          duplicate: true,
          idempotency_key: key
        };
      }
    }
  } catch {
    // Context table may be missing; still attempt the signal insert.
  }

  const result = await sql`
    insert into rmf_agent_signals(source,kind,payload,requested_authority)
    values(${source},${kind},${sql.json(nextPayload as any)},${authority})
    returning id,status,requested_authority,created_at
  `;
  return { ...result[0], duplicate: false, idempotency_key: key };
}

function asQueueSignal(row: Record<string, unknown>): QueueSignal {
  return {
    id: Number(row.id),
    kind: String(row.kind || ""),
    status: String(row.status || ""),
    attempt_count: Number(row.attempt_count || 0),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ""),
    started_at:
      row.started_at == null
        ? null
        : row.started_at instanceof Date
          ? row.started_at.toISOString()
          : String(row.started_at),
    total_runs: Number(row.total_runs || 0),
    stale_timeout_runs: Number(row.stale_timeout_runs || 0)
  };
}

/**
 * Claim the next signal after bounded stale recovery.
 * Stale running runs are failed and kept. The same signal is not blindly requeued.
 * Legacy leftover queue items are closed (not deleted) so a current business_improve can run.
 */
export async function nextSignal() {
  return withDatabaseTimeout(async () => {
    await ensureOperatorSchema();
    const sql = db();

    // Platform can kill a worker before the catch block. Fail the run row; do not
    // recycle the parent signal unless the queue policy allows a bounded retry.
    await sql`
      update rmf_agent_runs
      set status='failed',closure_state='stale_timeout',error=coalesce(error,'stale_run_recovered_after_timeout'),completed_at=now()
      where status='running' and created_at < now() - interval '2 minutes'
    `;
    await sql`
      update rmf_agent_signals s
      set attempt_count = greatest(
        coalesce(s.attempt_count, 0),
        (select count(*)::int from rmf_agent_runs r where r.signal_id = s.id)
      )
      where s.status in ('queued', 'running')
    `;

    const open = await sql`
      select
        s.id, s.kind, s.status, s.attempt_count, s.created_at, s.started_at,
        (select count(*)::int from rmf_agent_runs r where r.signal_id = s.id) as total_runs,
        (
          select count(*)::int from rmf_agent_runs r
          where r.signal_id = s.id and r.closure_state = 'stale_timeout'
        ) as stale_timeout_runs
      from rmf_agent_signals s
      where s.status in ('queued', 'running')
      order by s.id
    `;
    const plan = planQueueMaintenance(open.map((row) => asQueueSignal(row as Record<string, unknown>)));

    for (const item of plan.close) {
      await sql`
        update rmf_agent_signals
        set status='failed',
            completed_at=coalesce(completed_at, now()),
            fail_reason=${item.reason}
        where id=${item.id} and status in ('queued', 'running')
      `;
    }
    for (const id of plan.requeue) {
      await sql`
        update rmf_agent_signals
        set status='queued', started_at=null
        where id=${id} and status='running'
      `;
    }
    if (plan.claimId == null) return null;

    const result = await sql`
      update rmf_agent_signals
      set status='running', started_at=now(), attempt_count=attempt_count + 1
      where id=${plan.claimId}
        and status='queued'
        and attempt_count < ${SIGNAL_MAX_ATTEMPTS}
      returning *
    `;
    return result[0] || null;
  }, DB_OPERATION_TIMEOUT_MS);
}

async function safeGithubContext(): Promise<Record<string, unknown>> {
  try {
    return await githubRead();
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function operatorContext() {
  await ensureOperatorSchema();
  const sql = db();
  const [ctx, recent, projects, gpts, runtime, github] = await Promise.all([
    sql`select key,value,updated_at from rmf_agent_context order by key`,
    sql`select event,capability,authority,admissible,detail,created_at from rmf_agent_ledger order by created_at desc limit 40`,
    sql`select id,slug,name,repository,vercel_project_id,status,config,updated_at from rmf_agent_projects order by id`,
    sql`select id,project_id,gpt_key,name,platform,external_id,instructions_ref,action_schema_ref,status,config,updated_at from rmf_agent_gpts order by id`,
    projectContextRead(),
    safeGithubContext()
  ]);
  return {
    harness: "closure-native-v1",
    canonical_context: ctx,
    projects,
    gpts,
    runtime,
    github,
    recent_ledger: recent
  };
}

export async function ledger(
  runId: number,
  event: string,
  authority: number,
  detail: Record<string, unknown>,
  capability?: string,
  admissible = true
) {
  await ensureOperatorSchema();
  const sql = db();
  await sql`
    insert into rmf_agent_ledger(run_id,event,capability,authority,admissible,detail)
    values(${runId},${event},${capability || null},${authority},${admissible},${sql.json(detail as any)})
  `;
}

async function storeReceipt(runId: number, receipt: OperatorToolReceipt) {
  const sql = db();
  const rows = await sql`
    insert into rmf_agent_receipts(
      run_id,tool,authority,request_digest,expected,observed,verified,rollback_ref,external_ref,detail
    ) values(
      ${runId},${receipt.tool},${receipt.authority},${receipt.request_digest},
      ${sql.json(receipt.expected as any)},${sql.json(receipt.observed as any)},${receipt.verified},
      ${receipt.rollback_ref},${receipt.external_ref},${sql.json(receipt.detail as any)}
    ) returning id,created_at
  `;
  return rows[0];
}

function fallbackProbePlan(): OperatorModelPlan {
  return normalizeModelPlan({
    summary: "Deterministic control probe: model planning was unavailable, so only the predefined closure taskset may be considered.",
    observations: ["The closure harness can verify bounded control independently of model availability."],
    candidates: [],
    required_authority: 2,
    requires_human_approval: false,
    verification: ["Compare expected and observed receipt digests and verify the diagnostic path is absent from the base branch."]
  });
}

function fallbackAnalysisPlan(reason: string): OperatorModelPlan {
  return normalizeModelPlan({
    summary: "Planner unavailable within the bounded run window; the harness halted safely without executing tools.",
    observations: [reason],
    candidates: [],
    required_authority: 1,
    requires_human_approval: false,
    verification: ["Confirm that no mutating tool was selected or executed."],
    business_impact: {
      bottleneck: "operator_planner_unavailable",
      hypothesis: "Restoring AI Gateway planning unblocks autonomous improve cycles.",
      recommended_next_step: "Verify AI_GATEWAY_API_KEY / model config, then re-run business_improve from the dashboard Agent Console.",
      expected_metric_effect: "No business metric change until planner recovers — report only.",
      funnel_stage: "ops",
      confidence: "high"
    }
  });
}

export async function gatewayPlan(input: unknown) {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY_not_configured");
  const model = process.env.RMF_OPERATOR_MODEL || "openai/gpt-5.6-terra";
  const registry = getOperatorToolRegistry();
  const timeoutMs = Math.max(3000, Math.min(45000, Number(process.env.RMF_OPERATOR_GATEWAY_TIMEOUT_MS || 15000)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Vercel-AI-App-Name": "Rate My Face Operator"
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are the planning component inside the Rate My Face closure-native builder harness. You do not directly execute tools. Return JSON only with keys summary, observations, candidates, required_authority, requires_human_approval, verification, business_impact. business_impact must be an object with bottleneck, hypothesis, recommended_next_step, expected_metric_effect, funnel_stage, confidence. candidates must be an array of objects with id, tool, authority, intent, reason, expected_return, reversible, invariants, args. Use only tools present in the supplied registry. Prefer the lowest authority and reversible actions. Never request, reveal, place in a prompt, or write credentials. L0=observe, L1=analyze, L2=isolated branch/sandbox, L3=preview, L4=bounded production, L5=economic spend, L6=strategic/permission expansion. Never claim an action executed; execution and verification are performed by the harness after your plan. For owner_chat, heartbeat, and business_improve signals, prioritize the commercial loop (free GPT → Action → account → persistence → credits → retention → experiment → profit) and explain how the recommended strategy helps the business. Never invent ChatGPT chat counts, Amazon revenue, or Stripe USD — mark missing sources Unavailable. Compare Me To Me and Appearance Agent are paid credit-metered Actions (not LIVE unlimited vision/coaching)."
          },
          {
            role: "user",
            content: JSON.stringify({ input, tool_registry: registry })
          }
        ]
      }),
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`AI_GATEWAY_timeout_after_${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`AI_GATEWAY_${response.status}:${(await response.text()).slice(0, 500)}`);
  }
  const body: any = await response.json();
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI_GATEWAY_empty");
  return {
    model,
    plan: normalizeModelPlan(JSON.parse(text)),
    usage: body.usage || null
  };
}

export async function runOneSignal() {
  const signal = await nextSignal();
  if (!signal) return { ok: true, idle: true, harness: "closure-native-v1" };

  const sql = db();
  const requested = clampAuthority(signal.requested_authority, 1);
  const maxAuthority = clampAuthority(process.env.RMF_OPERATOR_MAX_AUTHORITY, 1);
  const admittedAuthority = Math.min(requested, maxAuthority) as Authority;
  const runs = await sql`
    insert into rmf_agent_runs(signal_id,authority,status,harness,closure_state)
    values(${signal.id},${admittedAuthority},'running','closure-native-v1','context')
    returning id
  `;
  const runId = Number(runs[0].id);
  const payload =
    signal.payload && typeof signal.payload === "object"
      ? (signal.payload as Record<string, unknown>)
      : {};
  const metricsBefore = (payload.metrics_snapshot || null) as BusinessMetricsSnapshot | null;
  const kind = String(signal.kind);
  const signalId = Number(signal.id);
  const signalSource = String(signal.source);
  const isBuildCycle = kind === "business_improve" || kind === "heartbeat";
  let managerial: ManagerialDecision | null = null;
  if (isBuildCycle) {
    const receipts = await readFeatureReceipts();
    managerial = decideManagerialAction({
      evidence: inspectRepoEvidence(),
      receipts,
      admittedAuthority
    });
    payload.managerial_action = {
      kind: managerial.action,
      feature_id: managerial.selected_item?.id || null,
      title: managerial.selected_item?.title || null,
      acceptance: managerial.selected_item?.acceptance || [],
      blocked_on: managerial.blocked_on,
      reason: managerial.reason
    };
    signal.payload = payload;
    try {
      await realizeFeatureBacklogConsole();
    } catch {
      /* console persist is best-effort */
    }
  }

  async function persistStrategy(
    status: string,
    plan: OperatorModelPlan | null,
    closureState?: string | null
  ) {
    try {
      return await recordStrategyFromRun({
        source: signalSource,
        kind: kind,
        runId,
        signalId,
        status,
        closureState: closureState || null,
        plan,
        payload,
        metricsBefore
      });
    } catch {
      return null;
    }
  }

  try {
    await ledger(runId, "signal_admitted", admittedAuthority, {
      signal_id: signal.id,
      source: signal.source,
      kind: signal.kind,
      requested_authority: requested,
      max_authority: maxAuthority,
      admitted_authority: admittedAuthority
    });

    const context = await operatorContext();
    const contextDigest = digest(context);
    await sql`update rmf_agent_runs set context_digest=${contextDigest},closure_state='plan' where id=${runId}`;
    await ledger(runId, "context_realized", admittedAuthority, {
      context_digest: contextDigest,
      github: context.github,
      runtime: context.runtime
    }, "project_context_read");

    let ai: { model: string; plan: OperatorModelPlan; usage: any };
    if (isBuildCycle && managerial) {
      ai = { model: "managerial-loop-v1", plan: managerialPlan(managerial), usage: null };
      await ledger(runId, "managerial_selected", admittedAuthority, {
        action: managerial.action,
        feature_id: managerial.selected_item?.id || null,
        blocked_on: managerial.blocked_on,
        reason: managerial.reason,
        feature_progress: false
      }, "feature_backlog", managerial.action !== "blocked" && managerial.action !== "idle");
    } else {
      try {
        ai = await gatewayPlan({
          signal: {
            id: signal.id,
            source: signal.source,
            kind: signal.kind,
            payload: signal.payload
          },
          admitted_authority: admittedAuthority,
          project: context
        });
      } catch (error) {
        const reason = errorMessage(error);
        if (String(signal.kind) === "control_probe") {
          ai = { model: "deterministic-closure-taskset", plan: fallbackProbePlan(), usage: null };
        } else {
          ai = { model: "safe-planner-fallback", plan: fallbackAnalysisPlan(reason), usage: null };
        }
        await ledger(runId, "planner_fallback", admittedAuthority, {
          reason,
          fallback: String(signal.kind) === "control_probe" ? "deterministic_control_probe" : "safe_halt"
        }, String(signal.kind) === "control_probe" ? "control_probe" : "project_context_read", false);
      }
    }

    const closure = resolveClosure(signal, ai.plan, admittedAuthority);
    await sql`
      update rmf_agent_runs
      set model=${ai.model},plan=${sql.json(ai.plan as any)},closure_state=${closure.state}
      where id=${runId}
    `;
    await ledger(runId, "closure_resolved", admittedAuthority, {
      state: closure.state,
      reason: closure.reason,
      required_authority: closure.required_authority,
      selected: closure.selected,
      evaluations: closure.evaluations,
      self_limit: closure.self_limit
    }, closure.selected?.tool, closure.state === "execute");

    if (closure.state === "awaiting_approval") {
      const capability = closure.selected?.tool || "proposed_actions";
      await sql`
        insert into rmf_agent_approvals(run_id,capability,requested_authority,rationale)
        values(${runId},${capability},${closure.required_authority},${`${closure.reason}: ${ai.plan.summary || "Expanded authority requested"}`})
      `;
      const cycle = managerial
        ? classifyCycle({ decision: managerial, closureState: "awaiting_approval" })
        : null;
      await sql`
        update rmf_agent_runs
        set status='awaiting_approval',result=${sql.json({ usage: ai.usage, executed: false, closure, cycle, feature_progress: false } as any)},completed_at=now()
        where id=${runId}
      `;
      await sql`update rmf_agent_signals set status='awaiting_approval',completed_at=now() where id=${signal.id}`;
      const strategy_report = await persistStrategy("awaiting_approval", ai.plan, closure.state);
      return {
        ok: true,
        run_id: runId,
        status: "awaiting_approval",
        harness: "closure-native-v1",
        plan: ai.plan,
        closure,
        cycle,
        feature_progress: false,
        blocked_on: cycle?.blocked_on || "approval",
        strategy_report
      };
    }

    if (closure.state === "halted" || !closure.selected) {
      const cycle = managerial
        ? classifyCycle({
            decision: managerial,
            executedTool: null,
            closureState: closure.state
          })
        : null;
      const honestIdle = managerial?.action === "idle";
      const status = cycle?.outcome === "noop_failed" ? "failed" : honestIdle ? "completed" : "halted";
      const closureState = honestIdle
        ? "idle_no_unfinished"
        : cycle?.outcome === "blocked"
          ? "blocked"
          : cycle?.outcome === "noop_failed"
            ? "noop_failed"
            : closure.state;
      await sql`
        update rmf_agent_runs
        set status=${status},closure_state=${closureState},result=${sql.json({ usage: ai.usage, executed: false, closure, cycle, feature_progress: false } as any)},completed_at=now()
        where id=${runId}
      `;
      await sql`update rmf_agent_signals set status=${status === "failed" ? "failed" : "completed"},completed_at=now() where id=${signal.id}`;
      await ledger(runId, honestIdle ? "managerial_idle" : cycle?.outcome === "noop_failed" ? "managerial_noop_failed" : "self_limit_halt", admittedAuthority, {
        reason: managerial?.reason || closure.reason,
        self_limit: closure.self_limit,
        cycle,
        feature_progress: false
      }, undefined, honestIdle);
      const strategy_report = await persistStrategy(status, ai.plan, closureState);
      return {
        ok: honestIdle || cycle?.outcome === "blocked",
        run_id: runId,
        status,
        harness: "closure-native-v1",
        plan: ai.plan,
        closure,
        cycle,
        feature_progress: false,
        blocked_on: cycle?.blocked_on || managerial?.blocked_on || null,
        strategy_report
      };
    }

    await sql`update rmf_agent_runs set closure_state='execute' where id=${runId}`;
    await ledger(runId, "tool_execution_started", admittedAuthority, {
      tool: closure.selected.tool,
      candidate: closure.selected
    }, closure.selected.tool);

    const receipt = await executeOperatorTool(
      closure.selected.tool,
      closure.selected.args,
      {
        runId,
        signalId: Number(signal.id),
        admittedAuthority
      }
    );
    const receiptRow = await storeReceipt(runId, receipt);
    await ledger(runId, "independent_return", admittedAuthority, {
      receipt_id: receiptRow.id,
      tool: receipt.tool,
      verified: receipt.verified,
      expected: receipt.expected,
      observed: receipt.observed,
      rollback_ref: receipt.rollback_ref,
      external_ref: receipt.external_ref
    }, receipt.tool, receipt.verified);

    const cycle = managerial
      ? classifyCycle({
          decision: managerial,
          executedTool: receipt.tool,
          closureState: receipt.verified ? "closed" : "verification_failed",
          receiptVerified: receipt.verified
        })
      : null;
    if (managerial && (receipt.tool === "feature_production_verify" || receipt.tool === "github_implementation_dispatch")) {
      try {
        await appendFeatureReceipt(
          receiptFromTool({
            itemId: managerial.selected_item?.id || null,
            kind: receipt.tool === "feature_production_verify" ? "production_verify" : "implementation_dispatch",
            verified: receipt.verified,
            runId,
            signalId: Number(signal.id),
            externalRef: receipt.external_ref,
            blockedOn: cycle?.blocked_on || null,
            detail: {
              tool: receipt.tool,
              expected: receipt.expected,
              observed: receipt.observed,
              advances_backlog: receipt.detail?.advances_backlog === true
            }
          })
        );
        await realizeFeatureBacklogConsole();
      } catch {
        /* receipt persist is best-effort after the tool already ran */
      }
    }
    const noopFailed = cycle?.outcome === "noop_failed";
    const finalStatus = noopFailed ? "failed" : receipt.verified ? "completed" : "verification_failed";
    const closureState = noopFailed ? "noop_failed" : receipt.verified ? "closed" : "verification_failed";
    await sql`
      update rmf_agent_runs
      set status=${finalStatus},closure_state=${closureState},
          result=${sql.json({ usage: ai.usage, executed: true, closure, receipt_id: receiptRow.id, receipt, cycle, feature_progress: cycle?.feature_progress === true } as any)},
          completed_at=now()
      where id=${runId}
    `;
    await sql`
      update rmf_agent_signals
      set status=${finalStatus === "completed" ? "completed" : "failed"},completed_at=now()
      where id=${signal.id}
    `;
    await ledger(runId, noopFailed ? "managerial_noop_failed" : receipt.verified ? "closure_closed" : "closure_failed", admittedAuthority, {
      tool: receipt.tool,
      verified: receipt.verified,
      cycle,
      feature_progress: cycle?.feature_progress === true,
      self_limit: "halt_after_one_tool_return"
    }, receipt.tool, receipt.verified && !noopFailed);

    const strategy_report = await persistStrategy(finalStatus, ai.plan, closureState);
    return {
      ok: receipt.verified && !noopFailed,
      run_id: runId,
      status: finalStatus,
      harness: "closure-native-v1",
      plan: ai.plan,
      closure,
      receipt,
      cycle,
      feature_progress: cycle?.feature_progress === true,
      blocked_on: cycle?.blocked_on || null,
      strategy_report
    };
  } catch (error) {
    const message = errorMessage(error);
    await sql`
      update rmf_agent_runs
      set status='failed',closure_state='error',error=${message},completed_at=now()
      where id=${runId}
    `;
    await sql`update rmf_agent_signals set status='failed',completed_at=now() where id=${signal.id}`;
    await ledger(runId, "run_failed", admittedAuthority, { error: message }, undefined, false);
    throw error;
  }
}
