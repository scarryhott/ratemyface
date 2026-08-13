import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERSONAL_EXPERIMENT_ACTION_COST,
  PERSONAL_EXPERIMENTS
} from "./personalExperimentEvidence.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

describe("Personal Experiments product wiring", () => {
  it("is a paid authenticated feature with two evidence tables", () => {
    assert.equal(PERSONAL_EXPERIMENTS.enabled, true);
    assert.equal(PERSONAL_EXPERIMENTS.status, "paid");
    assert.equal(PERSONAL_EXPERIMENT_ACTION_COST, 1);
    assert.deepEqual(PERSONAL_EXPERIMENTS.tables, [
      "rmf_personal_experiments",
      "rmf_personal_experiment_outcomes"
    ]);
  });

  it("route requires OAuth, consent, credits, schema, and a bounded DB wait", () => {
    const route = readFileSync(join(ROOT, "app", "api", "experiments", "route.ts"), "utf8");
    assert.match(route, /currentOAuthUser/);
    assert.match(route, /oauth_required/);
    assert.match(route, /consent_experiment_required/);
    assert.match(route, /consumeCredits/);
    assert.match(route, /personalExperimentTablesReady/);
    assert.match(route, /withDatabaseTimeout/);
    assert.match(route, /database_timeout/);
    assert.match(route, /recordPersonalExperimentOutcome/);
    assert.match(route, /completePersonalExperiment/);
  });

  it("OpenAPI exposes read and write Actions with explicit evidence states", () => {
    const openapi = readFileSync(join(ROOT, "app", "api", "openapi", "route.ts"), "utf8");
    assert.match(openapi, /getPersonalExperiments/);
    assert.match(openapi, /updatePersonalExperiment/);
    assert.match(openapi, /PersonalExperimentRequest/);
    assert.match(openapi, /insufficient/);
    assert.match(openapi, /tied/);
    assert.match(openapi, /favors_a/);
    assert.match(openapi, /favors_b/);
  });

  it("health reports the feature without a causal or medical claim", () => {
    const health = readFileSync(join(ROOT, "app", "api", "health", "route.ts"), "utf8");
    assert.match(health, /personal_experiments/);
    assert.match(health, /PERSONAL_EXPERIMENTS\.enabled/);
    assert.match(health, /PERSONAL_EXPERIMENT_ACTION_COST/);
  });

  it("Custom GPT instructions invoke the feature and preserve non-directional states", () => {
    const instructions = readFileSync(join(ROOT, "GPT_INSTRUCTIONS.md"), "utf8");
    assert.match(instructions, /updatePersonalExperiment/);
    assert.match(instructions, /getPersonalExperiments/);
    assert.match(instructions, /Preserve `insufficient` and `tied` as non-directional states/);
    assert.match(instructions, /never causal, population, or medical proof/);
    assert.ok(instructions.length <= 7900, `GPT_INSTRUCTIONS.md is ${instructions.length} chars`);
  });
});
