/**
 * Compare Me To Me authenticated TEST path (public feature stays DISABLED).
 * Run: node --experimental-strip-types --test lib/compareJobs.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPARE_ME_TO_ME,
  COMPARE_TEST_ACTION,
  COMPARE_TEST_ACTION_COST,
  compareDisabledResponse
} from "./compareFeature.ts";
import { buildHonestCompareTestResult } from "./compareTestShape.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

describe("buildHonestCompareTestResult", () => {
  const snapshot = {
    profile: {
      consent_personalization: true,
      preferences: { look: "natural professional", beard: "short" }
    },
    latest_interaction: {
      id: 11,
      kind: "preference",
      summary: "Updated personal preferences",
      data: { preferences: { look: "natural professional" } },
      created_at: "2026-08-13T00:00:00.000Z"
    },
    latest_recommendation: {
      id: 7,
      item_type: "product",
      title: "Beard oil",
      url: "https://www.amazon.com/s?k=beard+oil&tag=ratemyfacegpt-20",
      created_at: "2026-08-13T00:00:00.000Z"
    }
  };

  it("recaps stored history without live vision, products, or medical claims", () => {
    const result = buildHonestCompareTestResult(snapshot);
    assert.match(result.summary, /TEST recap/i);
    assert.equal(result.score.live_vision, false);
    assert.equal(result.score.live_product, false);
    assert.equal(result.score.medical_claims, false);
    assert.equal(result.score.public_feature_enabled, false);
    assert.equal(result.score.mode, "history_placeholder");
    assert.equal(result.data.live_product, false);
    assert.equal(result.data.medical_claims, false);
    assert.deepEqual(result.data.preference_keys, ["look", "beard"]);
    const saved = result.data.latest_saved_item as Record<string, unknown>;
    assert.equal(saved.generated_by_compare, false);
    assert.equal(saved.previously_saved, true);
    assert.equal(saved.title, "Beard oil");
    assert.equal("url" in saved, false);
    assert.equal(/diagnos|treat|cure/i.test(result.summary), false);
    assert.equal(JSON.stringify(result).includes("B0"), false);
  });

  it("still returns an honest placeholder when history is sparse", () => {
    const result = buildHonestCompareTestResult({
      profile: null,
      latest_interaction: {
        id: 1,
        kind: "chat",
        summary: "hello",
        data: {},
        created_at: null
      },
      latest_recommendation: null
    });
    assert.equal(result.score.history_present, true);
    assert.equal(result.data.latest_saved_item, null);
    assert.equal(result.data.live_product, false);
  });
});

describe("compare public gate vs authenticated test", () => {
  it("keeps COMPARE_ME_TO_ME.enabled false with TESTING status", () => {
    assert.equal(COMPARE_ME_TO_ME.enabled, false);
    assert.equal(COMPARE_ME_TO_ME.status, "testing");
    assert.equal(COMPARE_ME_TO_ME.dashboard_status, "TESTING");
    assert.equal(COMPARE_ME_TO_ME.authenticated_test_path, "/api/compare/test");
    assert.equal(COMPARE_TEST_ACTION_COST, 1);
    assert.equal(COMPARE_TEST_ACTION, "compare:authenticated_test");
    const stub = compareDisabledResponse(503);
    assert.equal(stub.status, 503);
    assert.equal(stub.body.error, "compare_disabled");
    assert.equal(stub.body.enabled, false);
  });

  it("public /api/compare and /api/compare/jobs stay 503 stubs", () => {
    const compare = readFileSync(join(ROOT, "app/api/compare/route.ts"), "utf8");
    const jobs = readFileSync(join(ROOT, "app/api/compare/jobs/route.ts"), "utf8");
    assert.match(compare, /compareDisabledResponse\(503\)/);
    assert.match(jobs, /compareDisabledResponse\(503\)/);
    assert.equal(compare.includes("runAuthenticatedCompareTest"), false);
    assert.equal(jobs.includes("runAuthenticatedCompareTest"), false);
  });

  it("authenticated test route meters credits and is not an OpenAPI Action", () => {
    const testRoute = readFileSync(join(ROOT, "app/api/compare/test/route.ts"), "utf8");
    assert.match(testRoute, /runAuthenticatedCompareTest/);
    assert.match(testRoute, /consumeCredits/);
    assert.match(testRoute, /COMPARE_TEST_ACTION_COST/);
    assert.match(testRoute, /currentOAuthUser/);
    assert.match(testRoute, /operatorRequestAuthorized/);
    const openapi = readFileSync(join(ROOT, "app/api/openapi/route.ts"), "utf8");
    assert.equal(openapi.includes("/api/compare"), false);
    assert.equal(openapi.includes("compare:authenticated_test"), false);
  });

  it("test runner writes job, result, follow-up interaction, and context note", () => {
    const jobs = readFileSync(join(ROOT, "lib/compareJobs.ts"), "utf8");
    assert.match(jobs, /status = 'running'/);
    assert.match(jobs, /status = 'completed'/);
    assert.match(jobs, /status = 'failed'/);
    assert.match(jobs, /insert into rmf_compare_results/);
    assert.match(jobs, /"compare_test"/);
    assert.match(jobs, /item_type:\s*"context"/);
    assert.match(jobs, /live_product: false/);
    assert.match(jobs, /medical_claims: false/);
    assert.equal(jobs.includes("searchProduct"), false);
  });

  it("health still reports enabled=false and documents the test path", () => {
    const health = readFileSync(join(ROOT, "app/api/health/route.ts"), "utf8");
    assert.match(health, /FEATURE REMAINS DISABLED/);
    assert.match(health, /enabled:\s*COMPARE_ME_TO_ME\.enabled/);
    assert.match(health, /authenticated_test_path/);
    assert.match(health, /503 compare_disabled/);
    assert.match(health, /compare_authenticated_test_cost/);
  });
});
