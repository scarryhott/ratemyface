/**
 * Operator queue starvation / bounded stale retry (no live DB required).
 * Run: node --experimental-strip-types --test lib/operatorQueue.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SIGNAL_MAX_ATTEMPTS,
  canRetryAfterStale,
  effectiveAttemptCount,
  planQueueMaintenance,
  type QueueSignal
} from "./operatorQueue.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function signal(partial: Partial<QueueSignal> & Pick<QueueSignal, "id" | "kind" | "status">): QueueSignal {
  return {
    attempt_count: 0,
    created_at: "2026-08-10T00:00:00.000Z",
    started_at: null,
    total_runs: 0,
    stale_timeout_runs: 0,
    ...partial
  };
}

function applyPlan(
  signals: QueueSignal[],
  runs: Array<{ id: number; signal_id: number; status: string; closure_state: string | null }>,
  plan: ReturnType<typeof planQueueMaintenance>
) {
  const nextSignals = signals.map((row) => ({ ...row }));
  const nextRuns = runs.map((row) => ({ ...row }));
  for (const item of plan.close) {
    const row = nextSignals.find((s) => s.id === item.id);
    assert.ok(row, `close target ${item.id} must remain`);
    row.status = "failed";
    (row as QueueSignal & { fail_reason?: string }).fail_reason = item.reason;
  }
  for (const id of plan.requeue) {
    const row = nextSignals.find((s) => s.id === id);
    assert.ok(row, `requeue target ${id} must remain`);
    row.status = "queued";
    row.started_at = null;
  }
  if (plan.claimId != null) {
    const row = nextSignals.find((s) => s.id === plan.claimId);
    assert.ok(row, `claim target ${plan.claimId} must remain`);
    row.status = "running";
    row.started_at = "2026-08-13T17:00:00.000Z";
    row.attempt_count = effectiveAttemptCount(row) + 1;
  }
  return { signals: nextSignals, runs: nextRuns };
}

describe("bounded stale retry", () => {
  it("does not requeue a stale signal after max attempts", () => {
    const now = new Date("2026-08-13T17:00:00.000Z");
    const stale = signal({
      id: 1,
      kind: "business_improve",
      status: "running",
      created_at: "2026-08-13T14:00:00.000Z",
      started_at: "2026-08-13T14:13:00.000Z",
      attempt_count: 0,
      total_runs: SIGNAL_MAX_ATTEMPTS,
      stale_timeout_runs: SIGNAL_MAX_ATTEMPTS
    });
    assert.equal(canRetryAfterStale(stale), false);
    const plan = planQueueMaintenance([stale], now);
    assert.deepEqual(plan.close, [{ id: 1, reason: "stale_exhausted" }]);
    assert.deepEqual(plan.requeue, []);
    assert.equal(plan.claimId, null);
  });

  it("exhausted stale signal is not re-picked on the next claim", () => {
    const now = new Date("2026-08-13T17:05:00.000Z");
    const first = planQueueMaintenance(
      [
        signal({
          id: 1,
          kind: "control_probe",
          status: "running",
          started_at: "2026-08-13T14:13:00.000Z",
          total_runs: 4,
          stale_timeout_runs: 3
        })
      ],
      now
    );
    assert.equal(first.claimId, null);
    assert.equal(first.close[0]?.reason, "stale_exhausted");

    const second = planQueueMaintenance(
      [
        signal({
          id: 1,
          kind: "control_probe",
          status: "failed",
          attempt_count: 4,
          total_runs: 4,
          stale_timeout_runs: 4
        })
      ],
      now
    );
    assert.equal(second.claimId, null);
    assert.deepEqual(second.requeue, []);
  });

  it("allows one bounded requeue of a fresh business_improve that went stale once", () => {
    const now = new Date("2026-08-13T14:08:00.000Z");
    const plan = planQueueMaintenance(
      [
        signal({
          id: 6,
          kind: "business_improve",
          status: "running",
          created_at: "2026-08-13T14:00:00.000Z",
          started_at: "2026-08-13T14:05:00.000Z",
          attempt_count: 1,
          total_runs: 1,
          stale_timeout_runs: 1
        })
      ],
      now
    );
    assert.deepEqual(plan.close, []);
    assert.deepEqual(plan.requeue, [6]);
    assert.equal(plan.claimId, 6);
  });
});

describe("production starvation fixture (2026-08-13)", () => {
  const now = new Date("2026-08-13T17:00:00.000Z");
  const signals: QueueSignal[] = [
    signal({
      id: 1,
      kind: "control_probe",
      status: "running",
      created_at: "2026-08-10T12:00:00.000Z",
      started_at: "2026-08-13T14:13:00.000Z",
      attempt_count: 0,
      total_runs: 4,
      stale_timeout_runs: 3
    }),
    signal({ id: 2, kind: "heartbeat", status: "queued", created_at: "2026-08-11T14:00:00.000Z" }),
    signal({ id: 3, kind: "manual", status: "queued", created_at: "2026-08-12T09:00:00.000Z" }),
    signal({ id: 4, kind: "control_probe", status: "queued", created_at: "2026-08-12T15:00:00.000Z" }),
    signal({ id: 5, kind: "heartbeat", status: "queued", created_at: "2026-08-13T13:00:00.000Z" }),
    signal({
      id: 6,
      kind: "business_improve",
      status: "queued",
      created_at: "2026-08-13T14:00:00.000Z"
    })
  ];
  const runs = [
    { id: 1, signal_id: 1, status: "failed", closure_state: "stale_timeout" },
    { id: 2, signal_id: 1, status: "failed", closure_state: "stale_timeout" },
    { id: 3, signal_id: 1, status: "failed", closure_state: "stale_timeout" },
    { id: 4, signal_id: 1, status: "running", closure_state: "context" }
  ];

  it("claims the current business_improve once and closes the leftover stale queue", () => {
    const plan = planQueueMaintenance(signals, now);
    assert.equal(plan.claimId, 6);
    assert.equal(plan.requeue.includes(1), false);
    assert.deepEqual(
      plan.close.map((item) => item.id).sort((a, b) => a - b),
      [1, 2, 3, 4, 5]
    );
    assert.equal(plan.close.find((item) => item.id === 1)?.reason, "stale_exhausted");
    assert.ok(plan.close.filter((item) => item.id !== 1).every((item) => item.reason === "quarantined_legacy"));
  });

  it("keeps every signal and run row for audit after maintenance", () => {
    const plan = planQueueMaintenance(signals, now);
    const applied = applyPlan(signals, runs, plan);
    assert.equal(applied.signals.length, 6);
    assert.equal(applied.runs.length, 4);
    assert.deepEqual(
      applied.signals.map((row) => row.id),
      [1, 2, 3, 4, 5, 6]
    );
    assert.deepEqual(
      applied.runs.map((row) => row.id),
      [1, 2, 3, 4]
    );
    assert.equal(applied.signals.find((row) => row.id === 1)?.status, "failed");
    assert.equal(applied.signals.find((row) => row.id === 6)?.status, "running");
    assert.equal(applied.signals.find((row) => row.id === 6)?.attempt_count, 1);
    assert.ok(applied.signals.every((row) => row.id === 6 || row.status === "failed"));
  });

  it("does not pick signal #1 again after it is exhausted", () => {
    const plan = planQueueMaintenance(signals, now);
    const applied = applyPlan(signals, runs, plan);
    const again = planQueueMaintenance(
      applied.signals.filter((row) => row.status === "queued" || row.status === "running"),
      new Date("2026-08-13T17:01:00.000Z")
    );
    assert.equal(again.claimId, null);
    assert.equal(again.requeue.includes(1), false);
  });
});

describe("current business_improve wins", () => {
  it("supersedes an older queued business_improve and ignores older probes", () => {
    const plan = planQueueMaintenance(
      [
        signal({
          id: 4,
          kind: "business_improve",
          status: "queued",
          created_at: "2026-08-12T14:00:00.000Z"
        }),
        signal({
          id: 5,
          kind: "control_probe",
          status: "queued",
          created_at: "2026-08-12T15:00:00.000Z"
        }),
        signal({
          id: 6,
          kind: "business_improve",
          status: "queued",
          created_at: "2026-08-13T14:00:00.000Z"
        })
      ],
      new Date("2026-08-13T14:05:00.000Z")
    );
    assert.equal(plan.claimId, 6);
    assert.deepEqual(plan.close, [
      { id: 4, reason: "superseded" },
      { id: 5, reason: "quarantined_legacy" }
    ]);
  });
});

describe("worker / heartbeat wiring", () => {
  it("nextSignal uses the queue planner and does not blindly requeue every stale signal", () => {
    const agent = readFileSync(join(ROOT, "lib/operatorAgent.ts"), "utf8");
    const next = agent.slice(agent.indexOf("export async function nextSignal"));
    assert.match(next, /planQueueMaintenance/);
    assert.match(next, /withDatabaseTimeout/);
    assert.match(next, /fail_reason/);
    assert.match(next, /attempt_count/);
    assert.equal(next.includes("order by created_at\n      for update skip locked"), false);
    assert.match(agent, /alter table rmf_agent_signals add column if not exists attempt_count/);
    assert.match(agent, /alter table rmf_agent_signals add column if not exists fail_reason/);
  });

  it("worker maps a hung claim to 504 and heartbeat stays enqueue-only", () => {
    const run = readFileSync(join(ROOT, "app/api/operator/run/route.ts"), "utf8");
    const heartbeat = readFileSync(join(ROOT, "app/api/operator/heartbeat/route.ts"), "utf8");
    assert.match(run, /isDatabaseTimeoutError/);
    assert.match(run, /status:\s*504/);
    assert.match(run, /runOneSignal/);
    assert.equal(heartbeat.includes("runOneSignal"), false);
    assert.equal(heartbeat.includes("planQueueMaintenance"), false);
    assert.match(heartbeat, /enqueueSignalIdempotent/);
    assert.match(heartbeat, /withDatabaseTimeout/);
    assert.match(heartbeat, /HEARTBEAT_DB_TIMEOUT_MS/);
  });
});
