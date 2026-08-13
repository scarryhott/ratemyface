import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerFromHistory,
  evaluateProductLearning,
  evaluateReferenceComparison,
  evaluateSocialOutcomes,
  planPersonalAgentAction,
  validateProductOutcome,
  validateReferenceDefinition,
  validateSocialOutcome
} from "./personalIntelligenceEvidence.ts";

describe("Outcome-aware product evidence closure", () => {
  it("keeps a single product outcome insufficient", () => {
    const result = evaluateProductLearning([{ recommendation_id: 1, title: "Serum", score: 5 }]);
    assert.equal(result.state, "insufficient");
    assert.equal(result.products[0].state, "insufficient");
    assert.equal(result.closure.relation_closed, false);
  });

  it("favors only a product with enough positive personal outcomes", () => {
    const result = evaluateProductLearning([
      { recommendation_id: 1, title: "Serum", score: 5 },
      { recommendation_id: 1, title: "Serum", score: 4 },
      { recommendation_id: 2, title: "Cream", score: 3 },
      { recommendation_id: 2, title: "Cream", score: 3 }
    ]);
    assert.equal(result.state, "favors_product");
    assert.equal(result.favored_recommendation_id, 1);
    assert.equal(result.products.find((row) => row.recommendation_id === 1)?.state, "works");
  });

  it("validates a saved-product reference and bounded 1-5 score", () => {
    assert.equal(validateProductOutcome({ recommendation_id: 2, score: 4 }).ok, true);
    assert.equal(validateProductOutcome({ recommendation_id: 0, score: 4 }).ok, false);
    assert.equal(validateProductOutcome({ recommendation_id: 2, score: 6 }).ok, false);
  });
});

describe("Authorized social outcome closure", () => {
  it("requires four observations before a trend direction", () => {
    const rows = [
      { provider: "instagram" as const, metric_label: "saves", metric_value: 10, observed_at: "2026-01-01" },
      { provider: "instagram" as const, metric_label: "saves", metric_value: 11, observed_at: "2026-01-02" },
      { provider: "instagram" as const, metric_label: "saves", metric_value: 20, observed_at: "2026-01-03" }
    ];
    assert.equal(evaluateSocialOutcomes(rows).relations[0].state, "insufficient");
    rows.push({ provider: "instagram", metric_label: "saves", metric_value: 21, observed_at: "2026-01-04" });
    assert.equal(evaluateSocialOutcomes(rows).relations[0].state, "improved");
  });

  it("accepts only supported providers and finite metrics", () => {
    assert.equal(validateSocialOutcome({ provider: "tiktok", metric_label: "views", metric_value: 10 }).ok, true);
    assert.equal(validateSocialOutcome({ provider: "x", metric_label: "views", metric_value: 10 }).ok, false);
    assert.equal(validateSocialOutcome({ provider: "tiktok", metric_label: "views", metric_value: Infinity }).ok, false);
  });
});

describe("Reference comparison closure", () => {
  it("distinguishes insufficient, tied, and directional paired evidence", () => {
    const one = evaluateReferenceComparison({
      reference_label: "Reference A",
      metric_label: "style confidence",
      observations: [{ self_score: 5, reference_score: 2 }]
    });
    assert.equal(one.state, "insufficient");
    const tied = evaluateReferenceComparison({
      reference_label: "Reference A",
      metric_label: "style confidence",
      observations: [
        { self_score: 4, reference_score: 4 },
        { self_score: 3, reference_score: 3 }
      ]
    });
    assert.equal(tied.state, "tied");
    assert.equal(tied.conclusion_available, false);
    const directional = evaluateReferenceComparison({
      reference_label: "Reference A",
      metric_label: "style confidence",
      observations: [
        { self_score: 5, reference_score: 3 },
        { self_score: 4, reference_score: 3 }
      ]
    });
    assert.equal(directional.state, "self_higher");
    assert.equal(directional.closure.relation_closed, true);
  });

  it("requires a distinct reference label", () => {
    assert.equal(validateReferenceDefinition({ title: "Look", reference_label: "Me", metric_label: "fit" }).ok, false);
    assert.equal(validateReferenceDefinition({ title: "Look", reference_label: "Editorial look", metric_label: "fit" }).ok, true);
  });
});

describe("Ask My History and bounded agent", () => {
  it("retrieves matching evidence and leaves unmatched history open", () => {
    const documents = [
      { source: "product_outcome" as const, id: "1", summary: "Vitamin C serum outcome 5/5", occurred_at: "2026-01-01" }
    ];
    assert.equal(answerFromHistory("Did vitamin C serum work?", documents).state, "answered");
    assert.equal(answerFromHistory("What beard length worked?", documents).state, "insufficient");
  });

  it("closes matching read-only goals and gates missing-evidence writes", () => {
    const read = planPersonalAgentAction("What product worked?", "answered");
    assert.equal(read.action_type, "ask_history");
    assert.equal(read.requires_approval, false);
    const proposed = planPersonalAgentAction("Which serum works?", "insufficient");
    assert.equal(proposed.action_type, "record_product_outcome");
    assert.equal(proposed.requires_approval, true);
  });
});
