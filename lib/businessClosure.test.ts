import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateBusinessClosure } from "./businessClosure.ts";

function input(overrides: Record<string, unknown> = {}) {
  return {
    features: ["account_learning", "compare_me_to_me", "appearance_agent", "personal_experiments", "personal_intelligence", "feature_monitor_adder"].map((feature_key) => ({ feature_key, lifecycle_status: "active", access_status: "available", evidence_status: "verified" })),
    agents: [{ auth_user_linked: true, feature_access: "full_authorized", last_verified_at: "2026-08-14T00:00:00Z" }],
    gpt_factory: { protected_gpt: { creator_mode: "human_only", factory_enabled: false, instruction_hash: "hash" }, factory_enabled_specs: 1, completed: 1 },
    monetary_snapshots: [{ source: "product_credits", metric_key: "lifetime_purchased", numeric_value: "1" }],
    ...overrides
  } as any;
}

describe("business closure evaluator", () => {
  it("closes only when every business component has end-to-end evidence", () => {
    const result = evaluateBusinessClosure(input());
    assert.equal(result.closed, true);
    assert.equal(result.unresolved.length, 0);
  });

  it("prioritizes a non-financial unresolved state ahead of the financial frontier", () => {
    const result = evaluateBusinessClosure(input({ agents: [], monetary_snapshots: [{ source: "product_credits", metric_key: "lifetime_purchased", numeric_value: "0" }] }));
    assert.equal(result.next_action?.key, "identity");
    assert.equal(result.components.find((item) => item.key === "money")?.state, "external_financial");
  });

  it("keeps a linked but scoped MCP identity short of full feature closure", () => {
    const result = evaluateBusinessClosure(input({
      agents: [{ auth_user_linked: true, feature_access: "scoped", last_verified_at: "2026-08-14T00:00:00Z" }]
    }));
    assert.equal(result.components.find((item) => item.key === "identity")?.state, "unresolved");
  });

  it("never treats the protected GPT as factory-eligible", () => {
    const result = evaluateBusinessClosure(input({ gpt_factory: { protected_gpt: { creator_mode: "agent_factory", factory_enabled: true, instruction_hash: "hash" }, factory_enabled_specs: 1, completed: 1 } }));
    assert.equal(result.components.find((item) => item.key === "protected")?.state, "unresolved");
    assert.equal(result.closed, false);
  });
});
