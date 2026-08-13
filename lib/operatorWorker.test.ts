/**
 * Operator worker hot path (no live DB / GitHub required).
 * Run: node --experimental-strip-types --test lib/operatorWorker.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyCycle, decideManagerialAction, inspectRepoEvidence } from "./agentFeatureBacklog.ts";
import {
  workerBlockedResult,
  workerCompletedResult,
  workerIdleResult,
  WORKER_HARNESS
} from "./operatorWorkerResult.ts";
import {
  GITHUB_TOOL_TIMEOUT_MS,
  GithubToolTimeoutError,
  isGithubToolTimeoutError,
  withGithubToolTimeout
} from "./operatorGithubTimeout.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function runOneSignalSource(): string {
  const agent = readFileSync(join(ROOT, "lib/operatorAgent.ts"), "utf8");
  const start = agent.indexOf("export async function runOneSignal");
  assert.ok(start >= 0, "runOneSignal must exist");
  return agent.slice(start);
}

describe("worker 200 idle/blocked/completed shapes", () => {
  it("idle is ok:true with status idle", () => {
    const idle = workerIdleResult();
    assert.equal(idle.ok, true);
    assert.equal(idle.idle, true);
    assert.equal(idle.status, "idle");
    assert.equal(idle.harness, WORKER_HARNESS);
  });

  it("blocked is ok:true with blocked_on and no feature progress", () => {
    const blocked = workerBlockedResult({
      run_id: 12,
      blocked_on: "github_deferred",
      reason: "github_timeout_8000ms"
    });
    assert.equal(blocked.ok, true);
    assert.equal(blocked.idle, false);
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.blocked_on, "github_deferred");
    assert.equal(blocked.feature_progress, false);
    assert.equal(blocked.run_id, 12);
  });

  it("completed is ok:true with optional receipt", () => {
    const completed = workerCompletedResult({
      run_id: 13,
      receipt: {
        tool: "feature_production_verify",
        authority: 0,
        request_digest: "abc",
        expected: {},
        observed: {},
        verified: true,
        rollback_ref: null,
        external_ref: "/api/health",
        detail: {}
      },
      feature_progress: true
    });
    assert.equal(completed.ok, true);
    assert.equal(completed.idle, false);
    assert.equal(completed.status, "completed");
    assert.equal(completed.receipt?.verified, true);
    assert.equal(completed.feature_progress, true);
  });
});

describe("worker hot path has no gatewayPlan", () => {
  it("runOneSignal does not call AI Gateway, operatorContext, or schema DDL", () => {
    const run = runOneSignalSource();
    assert.equal(run.includes("await gatewayPlan("), false);
    assert.equal(run.includes("gatewayPlan({"), false);
    assert.equal(run.includes("await operatorContext("), false);
    assert.equal(run.includes("ensureOperatorSchema("), false);
    assert.equal(run.includes("realizeFeatureBacklogConsole("), false);
    assert.match(run, /worker_hot_path_skips_gateway/);
    assert.match(run, /github_deferred/);
  });

  it("readFeatureReceipts and strategy persist skip schema DDL", () => {
    const loop = readFileSync(join(ROOT, "lib/agentBusinessLoop.ts"), "utf8");
    assert.equal(loop.includes("ensureOperatorSchema"), false);
    const receipts = loop.slice(loop.indexOf("export async function readFeatureReceipts"));
    assert.equal(receipts.includes("ensureOperatorSchema"), false);
  });
});

describe("runOneSignal cannot wait on GitHub without an 8s abort", () => {
  it("caps the whole GitHub tool at 8s", () => {
    assert.equal(GITHUB_TOOL_TIMEOUT_MS, 8_000);
    const tools = readFileSync(join(ROOT, "lib/operatorTools.ts"), "utf8");
    const timeout = readFileSync(join(ROOT, "lib/operatorGithubTimeout.ts"), "utf8");
    assert.match(tools, /withGithubToolTimeout\(\(\)=>githubRead\(\)\)/);
    assert.match(tools, /withGithubToolTimeout\(\(\)=>githubBranchDiagnostic/);
    assert.match(tools, /withGithubToolTimeout\(\(\)=>githubImplementationDispatch/);
    assert.match(timeout, /Math\.min\(Math\.trunc\(ms\),\s*GITHUB_TOOL_TIMEOUT_MS\)/);
    const run = runOneSignalSource();
    assert.match(run, /isGithubToolTimeoutError/);
    assert.match(run, /github_deferred/);
  });

  it("withGithubToolTimeout rejects a hang well before 45s", async () => {
    const started = Date.now();
    await assert.rejects(
      () => withGithubToolTimeout(() => new Promise(() => {}), 40),
      (error: unknown) => {
        assert.equal(isGithubToolTimeoutError(error), true);
        assert.equal(error instanceof GithubToolTimeoutError, true);
        return true;
      }
    );
    assert.ok(Date.now() - started < 400);
  });

  it("github_deferred classify is an honest blocked cycle, not a ship", () => {
    const decision = decideManagerialAction({
      evidence: inspectRepoEvidence({ github_write_configured: true, production_url: "https://example.vercel.app", max_authority: 2 }),
      receipts: [],
      admittedAuthority: 2
    });
    const cycle = classifyCycle({ decision, closureState: "github_deferred" });
    assert.equal(cycle.outcome, "blocked");
    assert.equal(cycle.blocked_on, "github_deferred");
    assert.equal(cycle.feature_progress, false);
  });
});

describe("worker_timeout remains mapped to 504", () => {
  it("GET/POST /api/operator/run still return JSON 504 worker_timeout", () => {
    const run = readFileSync(join(ROOT, "app/api/operator/run/route.ts"), "utf8");
    assert.match(run, /withWorkerTimeout/);
    assert.match(run, /isWorkerTimeoutError/);
    assert.match(run, /worker_timeout/);
    assert.match(run, /status:\s*504/);
    assert.match(run, /runOneSignal/);
    assert.equal(run.includes("300000"), false);
    assert.equal(run.includes("300_000"), false);
  });
});
