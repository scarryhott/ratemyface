import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTROL_TABLES,
  PROTECTED_GPT_INSTRUCTION_HASH,
  PROTECTED_GPT_KEY,
  UNIFIED_FEATURE_SEEDS,
  normalizeFeatureRegistration,
  normalizeGptFactoryRequest,
  projectBusinessMetricSnapshots,
  unavailableUnifiedControlPlane
} from "./unifiedControlPlaneShape.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = join(
  root,
  "supabase/migrations/20260814015300_unified_business_control_plane.sql"
);

describe("unified feature registry", () => {
  it("covers every named unified-project outcome", () => {
    const keys = new Set(UNIFIED_FEATURE_SEEDS.map((feature) => feature.feature_key));
    for (const required of [
      "codex_agent_account",
      "full_feature_access",
      "automatic_gpt_creator",
      "vercel_business_dashboard",
      "feature_monitor_adder",
      "monetary_intelligence",
      "credit_checkout",
      "affiliate_attribution"
    ]) {
      assert.equal(keys.has(required), true, `${required} must be registered`);
    }
    assert.equal(keys.size, UNIFIED_FEATURE_SEEDS.length, "feature keys must be unique");
  });

  it("does not convert repository seeds into verified evidence", () => {
    const view = unavailableUnifiedControlPlane("schema_pending");
    assert.equal(view.schema_ready, false);
    assert.equal(view.summary.verified, 0);
    assert.equal(view.summary.gaps, view.summary.total);
    assert.equal(view.agents[0]?.status, "provisioning_required");
  });

  it("normalizes authorized feature additions without granting verification", () => {
    const feature = normalizeFeatureRegistration({
      feature_key: "Retention Coach",
      name: "Retention Coach",
      category: "analytics",
      lifecycle_status: "building",
      access_status: "authorized",
      monetization_status: "measuring",
      source_of_truth: "database",
      priority: 18,
      acceptance: ["production event is measured"]
    });
    assert.equal(feature.feature_key, "retention_coach");
    assert.equal(feature.lifecycle_status, "building");
    assert.equal(feature.access_status, "authorized");
  });
});

describe("protected GPT factory boundary", () => {
  it("rejects every canonical Rate My Face factory key", () => {
    for (const key of ["rate_my_face", "Rate My Face", "rate-my-face", "ratemyface"]) {
      assert.throws(
        () => normalizeGptFactoryRequest({ gpt_key: key, name: "Forbidden" }),
        /protected_rate_my_face_gpt_factory_forbidden/
      );
    }
  });

  it("accepts a non-protected GPT job with deterministic idempotency", () => {
    const first = normalizeGptFactoryRequest({
      gpt_key: "style_shop_assistant",
      name: "Style Shop Assistant",
      configuration: { visibility: "private" }
    });
    const second = normalizeGptFactoryRequest({
      gpt_key: "style_shop_assistant",
      name: "Style Shop Assistant",
      configuration: { visibility: "private" }
    });
    assert.equal(first.idempotency_key, second.idempotency_key);
    assert.equal(first.gpt_key, "style_shop_assistant");
  });

  it("keeps protected files byte-identical to policy hashes", () => {
    const policy = JSON.parse(readFileSync(join(root, "POLICY_INVARIANTS.json"), "utf8"));
    const guards = policy.protected_assets.rate_my_face_gpt_instructions.repository_guards;
    assert.equal(guards.length, 2);
    for (const guard of guards) {
      const hash = createHash("sha256")
        .update(readFileSync(join(root, guard.path)))
        .digest("hex");
      assert.equal(hash, guard.sha256);
    }
    assert.equal(
      guards.find((guard: { path: string }) => guard.path === "GPT_INSTRUCTIONS.md")?.sha256,
      PROTECTED_GPT_INSTRUCTION_HASH
    );
  });
});

describe("control-plane migration security", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates every server-only table with RLS and revoked Data API access", () => {
    for (const table of CONTROL_TABLES) {
      assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
      assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
    }
    assert.doesNotMatch(sql, /force row level security/i);
  });

  it("makes the protected GPT human-only and ineligible for jobs", () => {
    assert.match(sql, /rmf_control_gpt_jobs_never_protected_check/);
    assert.match(sql, /check \(gpt_key <> 'rate_my_face'\)/);
    assert.match(sql, /rmf_control_protected_gpt_immutable/);
    assert.match(sql, /'human_only'/);
    assert.match(sql, /factory_enabled[\s\S]*false/);
    assert.equal(PROTECTED_GPT_KEY, "rate_my_face");
  });
});

describe("unified monetary snapshots", () => {
  it("projects observed counters without inventing revenue or cost", () => {
    const metrics = projectBusinessMetricSnapshots({
      captured_at: "2026-08-14T12:00:00.000Z",
      auth_users: 1,
      oauth_users: null,
      personal_profiles: 1,
      interactions: 2,
      personal_recommendations: 2,
      credit_balance_total: 92,
      lifetime_purchased: 0,
      lifetime_spent: 8,
      stripe_events: 0,
      agent_runs_7d: 4,
      agent_signals_queued: 0,
      pending_approvals: 1,
      credits_per_pack: 100,
      signup_credits: 100
    });

    assert.equal(metrics.some((metric) => metric.source === "stripe" && metric.numeric_value === 0), true);
    assert.equal(metrics.some((metric) => metric.metric_key === "oauth.users"), false);
    assert.equal(metrics.some((metric) => /revenue|cost|mrr|usd/i.test(metric.metric_key)), false);
    assert.deepEqual(
      metrics.find((metric) => metric.metric_key === "credits.lifetime_purchased"),
      { source: "product", metric_key: "credits.lifetime_purchased", numeric_value: 0, unit: "credits" }
    );
  });
});
