/**
 * Serverless Postgres fail-fast helpers (no live DB required).
 * Run: node --experimental-strip-types --test lib/db.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPEARANCE_ACTION_TIMEOUT_MS,
  COMPARE_ACTION_TIMEOUT_MS,
  COMPARE_TEST_DB_TIMEOUT_MS,
  HEARTBEAT_DB_TIMEOUT_MS,
  OPERATOR_READ_TIMEOUT_MS,
  OPERATOR_SCHEMA_TIMEOUT_MS,
  OPERATOR_WORKER_DB_TIMEOUT_MS,
  OPERATOR_WORKER_TIMEOUT_MS,
  PROVIDER_OAUTH_TIMEOUT_MS,
  DatabaseTimeoutError,
  WorkerTimeoutError,
  dbClientGeneration,
  isDatabaseTimeoutError,
  isWorkerTimeoutError,
  newSchemaSlot,
  resetDbClient,
  runOncePerDbClient,
  withDatabaseTimeout,
  withWorkerTimeout
} from "./db.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

describe("withDatabaseTimeout", () => {
  it("rejects a hanging operation well before a 300s platform limit", async () => {
    const started = Date.now();
    await assert.rejects(
      () => withDatabaseTimeout(() => new Promise(() => {}), 40),
      (error: unknown) => {
        assert.equal(isDatabaseTimeoutError(error), true);
        assert.equal(error instanceof DatabaseTimeoutError, true);
        return true;
      }
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 400, `expected fail-fast, took ${elapsed}ms`);
  });

  it("returns successful work that finishes inside the budget", async () => {
    const value = await withDatabaseTimeout(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "ok";
    }, 200);
    assert.equal(value, "ok");
  });

  it("bumps client generation on timeout so schema caches are not pinned", async () => {
    const before = dbClientGeneration();
    await assert.rejects(() => withDatabaseTimeout(() => new Promise(() => {}), 30));
    assert.ok(dbClientGeneration() > before);
  });
});

describe("withWorkerTimeout", () => {
  it("rejects a hanging worker well before a 300s platform limit", async () => {
    const started = Date.now();
    await assert.rejects(
      () => withWorkerTimeout(() => new Promise(() => {}), 40),
      (error: unknown) => {
        assert.equal(isWorkerTimeoutError(error), true);
        assert.equal(isDatabaseTimeoutError(error), false);
        assert.equal(error instanceof WorkerTimeoutError, true);
        return true;
      }
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 400, `expected fail-fast, took ${elapsed}ms`);
  });

  it("bumps client generation on worker timeout", async () => {
    const before = dbClientGeneration();
    await assert.rejects(() => withWorkerTimeout(() => new Promise(() => {}), 30));
    assert.ok(dbClientGeneration() > before);
  });
});

describe("runOncePerDbClient", () => {
  it("starts a new attempt after resetDbClient instead of awaiting a hung cache", async () => {
    const slot = newSchemaSlot();
    let calls = 0;
    void runOncePerDbClient(slot, () => {
      calls += 1;
      return new Promise(() => {});
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    resetDbClient("test");
    await runOncePerDbClient(slot, async () => {
      calls += 1;
    });
    assert.equal(calls, 2);
  });
});

describe("compare POST hang regression (no live DB)", () => {
  it("POST /api/compare/test bounds DB work and maps timeout to 504 database_timeout", () => {
    const testRoute = readFileSync(join(ROOT, "app/api/compare/test/route.ts"), "utf8");
    assert.match(testRoute, /withDatabaseTimeout/);
    assert.match(testRoute, /COMPARE_TEST_DB_TIMEOUT_MS/);
    assert.match(testRoute, /database_timeout/);
    assert.match(testRoute, /status:\s*504/);
    assert.match(testRoute, /consumeCredits/);
    assert.ok(COMPARE_TEST_DB_TIMEOUT_MS <= 15_000);
    assert.ok(COMPARE_TEST_DB_TIMEOUT_MS < 30_000);
    const getHandler = testRoute.slice(testRoute.indexOf("export async function GET"), testRoute.indexOf("export async function POST"));
    assert.equal(getHandler.includes("withDatabaseTimeout"), false);
    assert.equal(getHandler.includes("readCompareLearningSnapshot"), false);
  });

  it("POST /api/appearance (paid Actions) bound work and map timeout to 504", () => {
    const plan = readFileSync(join(ROOT, "app/api/appearance/route.ts"), "utf8");
    const checkin = readFileSync(join(ROOT, "app/api/appearance/plans/route.ts"), "utf8");
    for (const route of [plan, checkin]) {
      assert.match(route, /withDatabaseTimeout/);
      assert.match(route, /APPEARANCE_ACTION_TIMEOUT_MS/);
      assert.match(route, /database_timeout/);
      assert.match(route, /status:\s*504/);
      assert.match(route, /oauth_required/);
    }
    assert.match(plan, /consumeCredits/);
    assert.match(checkin, /consumeCredits/);
    assert.ok(APPEARANCE_ACTION_TIMEOUT_MS <= 15_000);
    assert.ok(APPEARANCE_ACTION_TIMEOUT_MS < 30_000);
  });

  it("POST /api/compare (paid Action) bounds work and maps timeout to 504", () => {
    const compare = readFileSync(join(ROOT, "app/api/compare/route.ts"), "utf8");
    assert.match(compare, /withDatabaseTimeout/);
    assert.match(compare, /COMPARE_ACTION_TIMEOUT_MS/);
    assert.match(compare, /database_timeout/);
    assert.match(compare, /status:\s*504/);
    assert.match(compare, /consumeCredits/);
    assert.match(compare, /consent_compare/);
    assert.ok(COMPARE_ACTION_TIMEOUT_MS <= 25_000);
    assert.ok(COMPARE_ACTION_TIMEOUT_MS < 30_000);
  });

  it("simulates the POST DB phase hanging before consumeCredits and fails fast", async () => {
    const hangingSnapshot = () => new Promise<never>(() => {});
    const started = Date.now();
    let status = 0;
    let error = "";
    try {
      await withDatabaseTimeout(async () => {
        await hangingSnapshot();
        throw new Error("must_not_reach_consumeCredits");
      }, 40);
    } catch (caught) {
      if (isDatabaseTimeoutError(caught)) {
        status = 504;
        error = "database_timeout";
      }
    }
    assert.equal(status, 504);
    assert.equal(error, "database_timeout");
    assert.ok(Date.now() - started < 400);
  });

  it("GET /api/operator/heartbeat is enqueue-only and bounded under 10s", () => {
    const heartbeat = readFileSync(join(ROOT, "app/api/operator/heartbeat/route.ts"), "utf8");
    assert.match(heartbeat, /withDatabaseTimeout/);
    assert.match(heartbeat, /HEARTBEAT_DB_TIMEOUT_MS/);
    assert.match(heartbeat, /enqueueSignalIdempotent/);
    assert.equal(heartbeat.includes("runOneSignal"), false);
    assert.equal(heartbeat.includes("ensureOperatorSchema"), false);
    assert.ok(HEARTBEAT_DB_TIMEOUT_MS <= 8_000);
    assert.ok(HEARTBEAT_DB_TIMEOUT_MS < 10_000);
    const dbSource = readFileSync(join(ROOT, "lib/db.ts"), "utf8");
    assert.match(dbSource, /HEARTBEAT_DB_TIMEOUT_MS/);
  });

  it("GET/POST /api/operator/run maps DB and overall timeouts to 504 JSON under maxDuration", () => {
    const run = readFileSync(join(ROOT, "app/api/operator/run/route.ts"), "utf8");
    const dbSource = readFileSync(join(ROOT, "lib/db.ts"), "utf8");
    const agent = readFileSync(join(ROOT, "lib/operatorAgent.ts"), "utf8");
    assert.match(run, /withWorkerTimeout/);
    assert.match(run, /OPERATOR_WORKER_TIMEOUT_MS/);
    assert.match(run, /OPERATOR_WORKER_DB_TIMEOUT_MS/);
    assert.match(run, /isWorkerTimeoutError/);
    assert.match(run, /isDatabaseTimeoutError/);
    assert.match(run, /worker_timeout/);
    assert.match(run, /database_timeout/);
    assert.match(run, /status:\s*504/);
    assert.match(run, /runOneSignal/);
    assert.match(run, /maxDuration = 60/);
    assert.equal(run.includes("300000"), false);
    assert.equal(run.includes("300_000"), false);
    assert.ok(OPERATOR_WORKER_DB_TIMEOUT_MS <= 20_000);
    assert.ok(OPERATOR_WORKER_TIMEOUT_MS < 60_000);
    assert.ok(OPERATOR_WORKER_TIMEOUT_MS < 300_000);
    assert.ok(OPERATOR_WORKER_TIMEOUT_MS > OPERATOR_WORKER_DB_TIMEOUT_MS);
    assert.match(dbSource, /Math\.min\(Math\.trunc\(ms\),\s*55_000\)/);
    const nextStart = agent.indexOf("export async function nextSignal");
    const nextEnd = agent.indexOf("\nasync function safeGithubContext", nextStart);
    const next = agent.slice(nextStart, nextEnd === -1 ? undefined : nextEnd);
    assert.equal(next.includes("ensureOperatorSchema"), false);
    assert.match(next, /OPERATOR_WORKER_DB_TIMEOUT_MS/);
    const schema = agent.slice(
      agent.indexOf("export async function ensureOperatorSchema"),
      agent.indexOf("export async function enqueueSignal")
    );
    assert.match(schema, /withDatabaseTimeout/);
    assert.match(schema, /OPERATOR_SCHEMA_TIMEOUT_MS/);
    assert.ok(OPERATOR_SCHEMA_TIMEOUT_MS <= 8_000);
  });

  it("simulates worker DB hang and overall hang mapping to 504 JSON", async () => {
    const started = Date.now();
    let dbStatus = 0;
    let dbError = "";
    try {
      await withDatabaseTimeout(() => new Promise(() => {}), 40);
    } catch (caught) {
      if (isDatabaseTimeoutError(caught)) {
        dbStatus = 504;
        dbError = "database_timeout";
      }
    }
    assert.equal(dbStatus, 504);
    assert.equal(dbError, "database_timeout");

    let workerStatus = 0;
    let workerError = "";
    try {
      await withWorkerTimeout(() => new Promise(() => {}), 40);
    } catch (caught) {
      if (isWorkerTimeoutError(caught)) {
        workerStatus = 504;
        workerError = "worker_timeout";
      }
    }
    assert.equal(workerStatus, 504);
    assert.equal(workerError, "worker_timeout");
    assert.ok(Date.now() - started < 800);
  });

  it("GET /api/operator/agents uses the same bounded DB wrapper", () => {
    const agents = readFileSync(join(ROOT, "app/api/operator/agents/route.ts"), "utf8");
    assert.match(agents, /withDatabaseTimeout/);
    assert.match(agents, /OPERATOR_READ_TIMEOUT_MS/);
    assert.match(agents, /database_timeout/);
    assert.match(agents, /counts_available:\s*false/);
    assert.match(agents, /UNAVAILABLE/);
    assert.equal(agents.includes("ensureOperatorSchema"), false);
    assert.ok(OPERATOR_READ_TIMEOUT_MS <= 20_000);
    const dashboard = readFileSync(join(ROOT, "app/api/operator/dashboard/route.ts"), "utf8");
    assert.match(dashboard, /withDatabaseTimeout/);
    assert.match(dashboard, /getUnavailableOperatorDashboard/);
    assert.match(dashboard, /OPERATOR_READ_TIMEOUT_MS/);
    const consoleSource = readFileSync(join(ROOT, "components/dashboard/AgentConsole.tsx"), "utf8");
    assert.match(consoleSource, /Unavailable/);
    assert.match(consoleSource, /counts_available/);
    assert.match(consoleSource, /not live zeros/);
  });

  it("social provider connect/disconnect/callback bound DB work under 300s", () => {
    const connect = readFileSync(join(ROOT, "app/api/providers/connect/route.ts"), "utf8");
    const disconnect = readFileSync(join(ROOT, "app/api/providers/disconnect/route.ts"), "utf8");
    const callback = readFileSync(join(ROOT, "app/api/providers/tiktok/callback/route.ts"), "utf8");
    const list = readFileSync(join(ROOT, "app/api/providers/route.ts"), "utf8");
    assert.match(disconnect, /withDatabaseTimeout/);
    assert.match(callback, /withDatabaseTimeout/);
    assert.match(list, /withDatabaseTimeout/);
    assert.match(disconnect, /database_timeout/);
    assert.match(list, /status:\s*504/);
    assert.ok(PROVIDER_OAUTH_TIMEOUT_MS <= 15_000);
    assert.ok(PROVIDER_OAUTH_TIMEOUT_MS < 30_000);
    assert.equal(connect.includes("consumeCredits"), false);
  });

  it("db client sets statement_timeout and lock_timeout instead of relying on connect_timeout alone", () => {
    const dbSource = readFileSync(join(ROOT, "lib/db.ts"), "utf8");
    assert.match(dbSource, /statement_timeout/);
    assert.match(dbSource, /lock_timeout/);
    assert.match(dbSource, /createDbSocket/);
    assert.match(dbSource, /family:\s*4/);
  });
});
