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
  COMPARE_ACTION_TIMEOUT_MS,
  COMPARE_TEST_DB_TIMEOUT_MS,
  DatabaseTimeoutError,
  dbClientGeneration,
  isDatabaseTimeoutError,
  newSchemaSlot,
  resetDbClient,
  runOncePerDbClient,
  withDatabaseTimeout
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

  it("GET /api/operator/agents uses the same bounded DB wrapper", () => {
    const agents = readFileSync(join(ROOT, "app/api/operator/agents/route.ts"), "utf8");
    assert.match(agents, /withDatabaseTimeout/);
    assert.match(agents, /database_timeout/);
    assert.match(agents, /status:\s*504/);
  });

  it("db client sets statement_timeout and lock_timeout instead of relying on connect_timeout alone", () => {
    const dbSource = readFileSync(join(ROOT, "lib/db.ts"), "utf8");
    assert.match(dbSource, /statement_timeout/);
    assert.match(dbSource, /lock_timeout/);
    assert.match(dbSource, /createDbSocket/);
    assert.match(dbSource, /family:\s*4/);
  });
});
