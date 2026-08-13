import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PERSONAL_INTELLIGENCE, PERSONAL_INTELLIGENCE_ACTION_COST } from "./personalIntelligenceEvidence.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("Personal Intelligence product wiring", () => {
  it("registers six paid features and seven evidence/receipt tables", () => {
    assert.equal(PERSONAL_INTELLIGENCE.enabled, true);
    assert.equal(PERSONAL_INTELLIGENCE.status, "paid");
    assert.equal(PERSONAL_INTELLIGENCE_ACTION_COST, 1);
    assert.equal(PERSONAL_INTELLIGENCE.tables.length, 7);
  });

  it("routes require OAuth, consent on writes, credits, schema, and bounded DB waits", () => {
    for (const path of [
      ["app", "api", "history", "ask", "route.ts"],
      ["app", "api", "products", "outcomes", "route.ts"],
      ["app", "api", "social", "outcomes", "route.ts"],
      ["app", "api", "references", "route.ts"],
      ["app", "api", "personal-agent", "route.ts"]
    ]) {
      const route = readFileSync(join(ROOT, ...path), "utf8");
      assert.match(route, /currentOAuthUser/);
      assert.match(route, /runMeteredPersonalIntelligenceAction/);
    }
    const helper = readFileSync(join(ROOT, "lib", "personalIntelligenceRoute.ts"), "utf8");
    assert.match(helper, /personalIntelligenceTablesReady/);
    assert.match(helper, /consumeCredits/);
    assert.match(helper, /withDatabaseTimeout/);
    assert.match(helper, /database_timeout/);
  });

  it("OpenAPI exposes all six capabilities and explicit sparse/tied states", () => {
    const openapi = readFileSync(join(ROOT, "app", "api", "openapi", "route.ts"), "utf8");
    for (const operation of [
      "askMyHistory",
      "getProductLearning",
      "recordProductOutcome",
      "getSocialOutcomeIntelligence",
      "recordSocialOutcome",
      "getReferenceComparisons",
      "updateReferenceComparison",
      "getPersonalAgentRuns",
      "updatePersonalAgent"
    ]) {
      assert.match(openapi, new RegExp(operation));
    }
    assert.match(openapi, /insufficient/);
    assert.match(openapi, /tied/);
    assert.match(openapi, /Never claim an approved proposal executed by itself/);
  });

  it("MCP adds five read-only, server-scoped tools and no personal mutation", () => {
    const mcp = readFileSync(join(ROOT, "app", "api", "mcp", "route.ts"), "utf8");
    for (const tool of [
      "personal_ask_history",
      "personal_product_learning",
      "personal_social_outcomes",
      "personal_reference_comparisons",
      "personal_agent_status"
    ]) {
      assert.match(mcp, new RegExp(tool));
    }
    assert.match(mcp, /RMF_CHATGPT_MCP_USER_ID/);
    assert.match(mcp, /RMF_CHATGPT_MCP_TOKEN_not_configured/);
    assert.match(mcp, /personalRo=\{readOnlyHint:true/);
    assert.equal(/personal_(?:approve|record|write|complete)/.test(mcp), false);
  });
});
