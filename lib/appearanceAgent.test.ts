/**
 * Appearance Agent paid Actions: honest plan/check-in shaping + gates.
 * Run: node --experimental-strip-types --test lib/appearanceAgent.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPEARANCE_ACTION_COST,
  APPEARANCE_AGENT,
  APPEARANCE_CHECKIN_ACTION,
  APPEARANCE_PLAN_ACTION,
  appearanceDayIndex,
  buildHonestAppearanceCheckin,
  buildHonestAppearancePlan,
  requiredAppearanceHistory,
  sanitizeAppearanceGoal,
  type AppearanceHistorySnapshot
} from "./appearanceAgent.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const snapshot: AppearanceHistorySnapshot = {
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
    created_at: "2026-08-13T00:00:00.000Z"
  },
  latest_compare: {
    job_id: 3,
    status: "completed",
    summary: "Beard looks shorter and hair is neater.",
    completed_at: "2026-08-13T00:00:00.000Z"
  },
  active_plan: null
};

describe("requiredAppearanceHistory", () => {
  it("fails honestly when Account Learning is missing", () => {
    const missing = requiredAppearanceHistory({
      ...snapshot,
      profile: null,
      latest_interaction: null,
      latest_recommendation: null
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error, "no_account_learning_history");
  });

  it("fails honestly when Compare history is missing", () => {
    const missing = requiredAppearanceHistory({ ...snapshot, latest_compare: null });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error, "no_compare_history");
  });

  it("accepts stored learning + compare", () => {
    assert.equal(requiredAppearanceHistory(snapshot).ok, true);
  });
});

describe("buildHonestAppearancePlan", () => {
  it("recaps stored history without coaching, products, or medical claims", () => {
    const plan = buildHonestAppearancePlan(snapshot, "professional polish");
    assert.match(plan.summary, /90-day professional-image plan/i);
    assert.equal(plan.goal, "professional polish");
    assert.equal(plan.target_days, 90);
    assert.equal(plan.score.live_coaching, false);
    assert.equal(plan.score.live_product, false);
    assert.equal(plan.score.medical_claims, false);
    assert.equal(plan.score.invented_advice, false);
    assert.deepEqual(plan.data.preference_keys, ["look", "beard"]);
    const saved = plan.data.latest_saved_item as Record<string, unknown>;
    assert.equal(saved.generated_by_appearance, false);
    assert.equal(saved.previously_saved, true);
    assert.equal("url" in saved, false);
    assert.equal(/diagnos|treat|cure/i.test(plan.summary), false);
    assert.equal(JSON.stringify(plan).includes("B0"), false);
    assert.deepEqual(
      plan.windows.map((w) => w.day),
      [0, 30, 60, 90]
    );
  });

  it("rejects medical-looking goals instead of storing them as coaching", () => {
    assert.equal(sanitizeAppearanceGoal("diagnose this rash"), "professional image");
    assert.equal(sanitizeAppearanceGoal(""), "professional image");
  });
});

describe("buildHonestAppearanceCheckin", () => {
  it("uses elapsed days and does not invent coaching", () => {
    const started = new Date("2026-05-15T00:00:00.000Z");
    const now = new Date("2026-08-13T00:00:00.000Z").getTime();
    const checkin = buildHonestAppearanceCheckin(
      snapshot,
      {
        id: 1,
        goal: "professional image",
        status: "active",
        day_index: 0,
        target_days: 90,
        started_at: started.toISOString(),
        created_at: started.toISOString(),
        baseline_interaction_id: 11,
        baseline_image_ref: null
      },
      now
    );
    assert.equal(checkin.day_index, appearanceDayIndex(started.toISOString(), now));
    assert.ok(checkin.day_index >= 80);
    assert.equal(checkin.score.live_coaching, false);
    assert.equal(checkin.score.medical_claims, false);
    assert.match(checkin.summary, /Recap only/);
  });
});

describe("paid appearance gate", () => {
  it("enables the paid Actions as PAID, not a LIVE coaching claim", () => {
    assert.equal(APPEARANCE_AGENT.enabled, true);
    assert.equal(APPEARANCE_AGENT.status, "paid");
    assert.equal(APPEARANCE_AGENT.dashboard_status, "PAID");
    assert.equal(APPEARANCE_AGENT.action_path, "/api/appearance");
    assert.equal(APPEARANCE_AGENT.checkin_path, "/api/appearance/plans");
    assert.equal(APPEARANCE_ACTION_COST, 1);
    assert.equal(APPEARANCE_PLAN_ACTION, "appearance:plan");
    assert.equal(APPEARANCE_CHECKIN_ACTION, "appearance:checkin");
  });

  it("meters appearance at the same 1-credit unit as Personal Network", () => {
    const personal = readFileSync(join(ROOT, "lib/personalNetwork.ts"), "utf8");
    assert.match(personal, /export const PERSONAL_ACTION_COST = 1/);
    assert.equal(APPEARANCE_ACTION_COST, 1);
  });

  it("POST /api/appearance is the OAuth plan Action (not anonymous)", () => {
    const route = readFileSync(join(ROOT, "app/api/appearance/route.ts"), "utf8");
    assert.match(route, /oauth_required/);
    assert.match(route, /runAuthenticatedAppearancePlan/);
    assert.match(route, /consumeCredits/);
    assert.match(route, /consent_appearance/);
    assert.match(route, /withDatabaseTimeout/);
    assert.match(route, /database_timeout/);
    assert.equal(route.includes("searchProduct"), false);
  });

  it("POST /api/appearance/plans is the OAuth check-in Action (not anonymous)", () => {
    const route = readFileSync(join(ROOT, "app/api/appearance/plans/route.ts"), "utf8");
    assert.match(route, /oauth_required/);
    assert.match(route, /runAuthenticatedAppearanceCheckin/);
    assert.match(route, /consumeCredits/);
    assert.match(route, /consent_appearance/);
    assert.match(route, /withDatabaseTimeout/);
    assert.equal(route.includes("searchProduct"), false);
  });

  it("OpenAPI exposes appearancePlan and appearanceCheckin", () => {
    const openapi = readFileSync(join(ROOT, "app/api/openapi/route.ts"), "utf8");
    assert.match(openapi, /appearancePlan/);
    assert.match(openapi, /appearanceCheckin/);
    assert.match(openapi, /consent_appearance/);
    assert.equal(openapi.includes("GPT_INSTRUCTIONS"), false);
  });

  it("health reports the paid Actions without a LIVE coaching claim", () => {
    const health = readFileSync(join(ROOT, "app/api/health/route.ts"), "utf8");
    assert.match(health, /enabled:\s*APPEARANCE_AGENT\.enabled/);
    assert.match(health, /appearance_agent_cost/);
    assert.match(health, /appearancePlan/);
    assert.match(health, /401 oauth_required/);
  });

  it("writers persist plan/check-in and context notes without inventing products", () => {
    const jobs = readFileSync(join(ROOT, "lib/appearanceJobs.ts"), "utf8");
    assert.match(jobs, /insert into rmf_appearance_plans/);
    assert.match(jobs, /insert into rmf_appearance_checkins/);
    assert.match(jobs, /"appearance_plan"/);
    assert.match(jobs, /"appearance_checkin"/);
    assert.match(jobs, /item_type:\s*"context"/);
    assert.match(jobs, /live_coaching: false/);
    assert.match(jobs, /medical_claims: false/);
    assert.equal(jobs.includes("searchProduct"), false);
  });
});
