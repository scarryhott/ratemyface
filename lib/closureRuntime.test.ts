import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  funnelEvidenceFromMetrics,
  selectClosureRuntimeRound,
  type ClosureBuilderCandidate
} from "./closureRuntime.ts";

const features = [
  "account_learning",
  "compare_me_to_me",
  "appearance_agent",
  "personal_experiments",
  "personal_intelligence",
  "feature_monitor_adder"
].map((feature_key) => ({ feature_key, lifecycle_status: "active", access_status: "available", evidence_status: "verified" }));

function candidate(overrides: Partial<ClosureBuilderCandidate> = {}): ClosureBuilderCandidate {
  return {
    id: "monitor-runtime",
    title: "Build closure selector runtime",
    closure_component: "monitor",
    feature_key: "feature_monitor_adder",
    action: "code",
    authority: 2,
    exact_target: "lib/closureRuntime.ts",
    acceptance: ["Selector emits one bounded task capsule."],
    verification: ["Run selector tests."],
    rollback: "Revert the isolated runtime change.",
    funnel_stage: "operations",
    expected_metric: "verified_receipts_per_changed_state",
    customer_value: 4,
    revenue_potential: 4,
    confidence: 4,
    urgency: 4,
    time_to_ship: 1,
    estimated_agent_tokens: 4_000,
    operational_risk: 2,
    financial_mutation: false,
    protected_asset: false,
    handwritten_content_write: false,
    ...overrides
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    closure_input: {
      features,
      agents: [{ auth_user_linked: true, feature_access: "available", last_verified_at: "2026-08-14T00:00:00Z" }],
      gpt_factory: { protected_gpt: { creator_mode: "human_only", factory_enabled: false, instruction_hash: "hash" }, factory_enabled_specs: 1, completed: 1 },
      monetary_snapshots: [{ source: "product", metric_key: "credits.lifetime_purchased", numeric_value: "1" }]
    },
    candidates: [candidate()],
    funnel: {},
    admitted_authority: 2,
    ...overrides
  } as any;
}

describe("business closure runtime selector", () => {
  it("starts with GPT distribution and does not call bootstrap-credit use paid success", () => {
    const funnel = funnelEvidenceFromMetrics([
      { source: "openai", metric_key: "rate_my_face.chat_count_lower_bound", numeric_value: "600000" },
      { source: "supabase", metric_key: "auth.users", numeric_value: "5" },
      { source: "supabase", metric_key: "oauth.users", numeric_value: "1" },
      { source: "product", metric_key: "credits.lifetime_purchased", numeric_value: "0" },
      { source: "product", metric_key: "credits.lifetime_spent", numeric_value: "8" }
    ]);
    assert.deepEqual(funnel, {
      free_use: 600000,
      account: 1,
      credit_grant: 0,
      paid_feature_success: null
    });
  });

  it("persists scheduled cron rounds while ordinary owner GETs stay read-only", () => {
    const route = readFileSync(new URL("../app/api/operator/closure/route.ts", import.meta.url), "utf8");
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    assert.match(route, /mode === "cron" && auth\.actor === "vercel-cron"/);
    assert.match(route, /return respond\(request, "cron"\)/);
    assert.deepEqual(
      vercel.crons.find((cron: { path: string }) => cron.path === "/api/operator/closure"),
      { path: "/api/operator/closure", schedule: "10 14 * * *" }
    );
  });

  it("selects the highest value-per-token admissible builder task", () => {
    const round = selectClosureRuntimeRound(input({
      closure_input: { ...input().closure_input, features: features.map((feature) => feature.feature_key === "feature_monitor_adder" ? { ...feature, evidence_status: "partial" } : feature) },
      candidates: [candidate(), candidate({ id: "slow", title: "Slow alternative", time_to_ship: 4, estimated_agent_tokens: 16_000 })]
    }));
    assert.equal(round.mode, "build");
    assert.equal(round.selected?.id, "closure:monitor-runtime");
    assert.equal(round.selected?.financial_actions_allowed, false);
    assert.equal(round.selected?.protected_instruction_writes_allowed, false);
  });

  it("stops without reasoning when the closure cursor has not changed", () => {
    const first = selectClosureRuntimeRound(input());
    const second = selectClosureRuntimeRound(input({ previous_cursor: first.cursor }));
    assert.equal(second.mode, "idle_unchanged");
    assert.equal(second.reasoning, "none");
  });

  it("rejects financial and protected candidates even when their raw score is higher", () => {
    const round = selectClosureRuntimeRound(input({
      closure_input: { ...input().closure_input, features: features.map((feature) => feature.feature_key === "feature_monitor_adder" ? { ...feature, evidence_status: "partial" } : feature) },
      candidates: [
        candidate({ id: "financial", financial_mutation: true, action: "external_financial", customer_value: 5, revenue_potential: 5, confidence: 5, urgency: 5 }),
        candidate({ id: "protected", protected_asset: true, customer_value: 5, revenue_potential: 5, confidence: 5, urgency: 5 }),
        candidate()
      ]
    }));
    assert.equal(round.selected?.id, "closure:monitor-runtime");
    assert.ok(round.evaluations.find((item) => item.candidate.id === "financial")?.reasons.includes("financial_action_not_admitted"));
    assert.ok(round.evaluations.find((item) => item.candidate.id === "protected")?.reasons.includes("protected_or_handwritten_target_forbidden"));
  });

  it("does not reselect a verified feature when another feature keeps its component open", () => {
    const round = selectClosureRuntimeRound(input({
      closure_input: {
        ...input().closure_input,
        agents: [{ auth_user_linked: true, feature_access: "scoped", last_verified_at: "2026-08-14T00:00:00Z" }]
      },
      candidates: [
        candidate({ id: "verified-account", closure_component: "identity", feature_key: "codex_agent_account", funnel_stage: "account", feature_evidence_verified: true }),
        candidate({ id: "full-access", closure_component: "identity", feature_key: "full_feature_access", funnel_stage: "account", authority: 2 })
      ],
      admitted_authority: 1
    }));
    assert.equal(round.mode, "blocked");
    assert.equal(round.selected, null);
    assert.ok(round.evaluations.find((item) => item.candidate.id === "verified-account")?.reasons.includes("feature_evidence_already_verified"));
    assert.ok(round.evaluations.find((item) => item.candidate.id === "full-access")?.reasons.includes("authority_not_admitted"));
  });

  it("does not optimize a later funnel stage before the first measured drop-off", () => {
    const round = selectClosureRuntimeRound(input({
      closure_input: { ...input().closure_input, features: features.map((feature) => feature.feature_key === "feature_monitor_adder" ? { ...feature, evidence_status: "partial" } : feature) },
      funnel: { free_use: 100, account: 10, checkout: 10 },
      candidates: [candidate({ id: "checkout", funnel_stage: "checkout", customer_value: 5, revenue_potential: 5, confidence: 5, urgency: 5 }), candidate({ id: "account", funnel_stage: "account" })]
    }));
    assert.equal(round.funnel_frontier, "account");
    assert.equal(round.selected?.id, "closure:account");
  });

  it("permits a non-financial activation build at the money frontier but never a transaction", () => {
    const round = selectClosureRuntimeRound(input({
      closure_input: {
        ...input().closure_input,
        monetary_snapshots: [{ source: "product", metric_key: "credits.lifetime_purchased", numeric_value: "0" }]
      },
      candidates: [
        candidate({ id: "transaction", closure_component: "money", action: "external_financial", financial_mutation: true, funnel_stage: "payment", customer_value: 5, revenue_potential: 5, confidence: 5, urgency: 5 }),
        candidate({ id: "activation", closure_component: "money", action: "code", funnel_stage: "checkout", expected_metric: "checkout_created", financial_mutation: false })
      ]
    }));
    assert.equal(round.mode, "build");
    assert.equal(round.selected?.id, "closure:activation");
    assert.equal(round.selected?.financial_actions_allowed, false);
  });
});
