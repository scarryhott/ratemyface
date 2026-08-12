/**
 * Smoke tests for Account Learning interactions → recommendations pipeline.
 * Run: node --experimental-strip-types --test lib/accountLearningPipeline.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultInteractionSummary,
  extractRecommendationCandidate
} from "./accountLearningShape.ts";
import { COMPARE_ME_TO_ME, compareDisabledResponse, compareTestLinkEnabled } from "./compareFeature.ts";
import { APPEARANCE_AGENT } from "./appearanceAgent.ts";
import { SOCIAL_PROVIDER_OAUTH } from "./providerConnections.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

describe("extractRecommendationCandidate", () => {
  it("returns null for preference-only payloads (do not invent products)", () => {
    assert.equal(
      extractRecommendationCandidate({
        preferences: { look: "natural professional" },
        consent_personalization: true
      }),
      null
    );
    assert.equal(extractRecommendationCandidate({}), null);
    assert.equal(extractRecommendationCandidate(null), null);
  });

  it("extracts url/title from a saved product interaction", () => {
    const candidate = extractRecommendationCandidate({
      title: "Beard oil",
      url: "https://www.amazon.com/s?k=beard+oil&tag=ratemyfacegpt-20",
      item_type: "product"
    });
    assert.ok(candidate);
    assert.equal(candidate.item_type, "product");
    assert.equal(candidate.title, "Beard oil");
    assert.match(String(candidate.url), /amazon\.com/);
  });

  it("accepts affiliate_url and nested product blobs", () => {
    const fromAffiliate = extractRecommendationCandidate({
      affiliate_url: "https://www.amazon.com/dp/B0EXAMPLE?tag=ratemyfacegpt-20"
    });
    assert.equal(fromAffiliate?.url, "https://www.amazon.com/dp/B0EXAMPLE?tag=ratemyfacegpt-20");

    const fromNested = extractRecommendationCandidate({
      product: { title: "Pomade", url: "https://www.amazon.com/s?k=pomade&tag=ratemyfacegpt-20" }
    });
    assert.equal(fromNested?.title, "Pomade");
    assert.match(String(fromNested?.url), /pomade/);
  });

  it("uses extras (explicit save_recommendation fields) when present", () => {
    const candidate = extractRecommendationCandidate(
      { note: "keep this" },
      { title: "Clay", url: "https://www.amazon.com/s?k=clay&tag=ratemyfacegpt-20", item_type: "product" }
    );
    assert.equal(candidate?.title, "Clay");
    assert.match(String(candidate?.url), /clay/);
  });
});

describe("defaultInteractionSummary", () => {
  it("prefers caller summary, else kind defaults", () => {
    assert.equal(
      defaultInteractionSummary("preference", "Remember short beard", {}),
      "Remember short beard"
    );
    assert.equal(
      defaultInteractionSummary("preference", "  ", { preferences: { look: "natural" } }),
      "Updated personal preferences"
    );
    assert.equal(
      defaultInteractionSummary("recommendation", "", { title: "Beard oil" }),
      "Beard oil"
    );
    assert.equal(defaultInteractionSummary("feedback", "", {}), "Recorded recommendation feedback");
  });
});

describe("feature gates stay off", () => {
  it("Compare Me To Me remains disabled with 503 stub body", () => {
    assert.equal(COMPARE_ME_TO_ME.enabled, false);
    assert.equal(COMPARE_ME_TO_ME.status, "requires_account_learning");
    const stub = compareDisabledResponse(503);
    assert.equal(stub.status, 503);
    assert.equal(stub.body.enabled, false);
    assert.equal(stub.body.error, "compare_disabled");
  });

  it("compare test-link is off unless RMF_COMPARE_TEST_LINK=1", () => {
    assert.equal(compareTestLinkEnabled(), process.env.RMF_COMPARE_TEST_LINK === "1");
  });

  it("Appearance Agent and Social stay disabled", () => {
    assert.equal(APPEARANCE_AGENT.enabled, false);
    assert.equal(SOCIAL_PROVIDER_OAUTH.enabled, false);
  });
});

describe("pipeline wiring (source files)", () => {
  it("personal + memory writes go through recordLearningWrite", () => {
    const personal = readFileSync(join(ROOT, "app/api/personal/route.ts"), "utf8");
    assert.match(personal, /recordLearningWrite/);
    assert.match(personal, /kind:"preference"/);
    assert.match(personal, /kind:"recommendation"/);
    const memory = readFileSync(join(ROOT, "app/api/memory/context/route.ts"), "utf8");
    assert.match(memory, /recordLearningWrite/);
  });

  it("searchProduct stays free and does not write learning rows", () => {
    const product = readFileSync(join(ROOT, "app/api/product/route.ts"), "utf8");
    assert.equal(product.includes("recordLearningWrite"), false);
    assert.equal(product.includes("saveInteraction"), false);
    assert.equal(product.includes("saveRecommendation"), false);
  });

  it("/api/compare remains a 503 stub (no job enqueue)", () => {
    const compare = readFileSync(join(ROOT, "app/api/compare/route.ts"), "utf8");
    const jobs = readFileSync(join(ROOT, "app/api/compare/jobs/route.ts"), "utf8");
    assert.match(compare, /compareDisabledResponse\(503\)/);
    assert.match(jobs, /compareDisabledResponse\(503\)/);
    assert.equal(compare.includes("maybeLinkDisabledCompareJob"), false);
    assert.equal(jobs.includes("maybeLinkDisabledCompareJob"), false);
  });

  it("health still reports compare disabled and documents the learning pipeline", () => {
    const health = readFileSync(join(ROOT, "app/api/health/route.ts"), "utf8");
    assert.match(health, /FEATURE REMAINS DISABLED/);
    assert.match(health, /enabled:\s*COMPARE_ME_TO_ME\.enabled/);
    assert.match(health, /rmf_interactions → rmf_personal_recommendations/);
  });
});

describe("source_interaction_id migration", () => {
  it("adds a soft-link column without enabling Compare or FORCE RLS", () => {
    const sqlText = readFileSync(
      join(ROOT, "supabase/migrations/20260812210000_rmf_personal_recommendations_source_interaction.sql"),
      "utf8"
    );
    assert.match(sqlText, /add column if not exists source_interaction_id bigint/i);
    assert.match(sqlText, /Soft link \(no FK\)/);
    assert.equal(/\bforce\s+row\s+level\s+security\b/i.test(sqlText), false);
    assert.equal(/create table if not exists public\.rmf_compare_/i.test(sqlText), false);
    assert.match(sqlText, /Does NOT enable Compare Me To Me/i);
  });
});
