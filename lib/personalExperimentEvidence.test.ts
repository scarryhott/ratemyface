import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluatePersonalExperiment,
  validatePersonalExperimentDefinition,
  validatePersonalExperimentOutcome
} from "./personalExperimentEvidence.ts";

const definition = {
  option_a_label: "Short beard",
  option_b_label: "Clean-shaven",
  metric_label: "confidence"
};

describe("Personal Experiments evidence closure", () => {
  it("keeps sparse evidence explicitly insufficient", () => {
    const result = evaluatePersonalExperiment({
      ...definition,
      outcomes: [
        { option_key: "a", score: 5 },
        { option_key: "b", score: 2 }
      ]
    });
    assert.equal(result.verdict, "insufficient");
    assert.equal(result.conclusion_available, false);
    assert.equal(result.closure.minimum_evidence_met, false);
    assert.equal(result.closure.relation_closed, false);
    assert.equal(result.evidence.option_a.remaining_for_minimum, 1);
    assert.match(result.summary, /at least 2 outcomes for each option/i);
  });

  it("distinguishes a supported tie from insufficient evidence", () => {
    const result = evaluatePersonalExperiment({
      ...definition,
      outcomes: [
        { option_key: "a", score: 4 },
        { option_key: "a", score: 3 },
        { option_key: "b", score: 3 },
        { option_key: "b", score: 4 }
      ]
    });
    assert.equal(result.verdict, "tied");
    assert.equal(result.conclusion_available, false);
    assert.equal(result.closure.minimum_evidence_met, true);
    assert.equal(result.closure.relation_closed, false);
    assert.equal(result.evidence.score_gap_a_minus_b, 0);
  });

  it("provisionally favors option A only after both options meet the minimum", () => {
    const result = evaluatePersonalExperiment({
      ...definition,
      outcomes: [
        { option_key: "a", score: 5 },
        { option_key: "a", score: 4 },
        { option_key: "b", score: 2 },
        { option_key: "b", score: 3 }
      ]
    });
    assert.equal(result.verdict, "favors_a");
    assert.equal(result.favored_label, "Short beard");
    assert.equal(result.conclusion_available, true);
    assert.equal(result.closure.relation_closed, true);
    assert.match(result.caveat, /not proof of causation/i);
  });

  it("can favor option B without changing the option identities", () => {
    const result = evaluatePersonalExperiment({
      ...definition,
      outcomes: [
        { option_key: "a", score: 2 },
        { option_key: "a", score: 2 },
        { option_key: "b", score: 5 },
        { option_key: "b", score: 4 }
      ]
    });
    assert.equal(result.verdict, "favors_b");
    assert.equal(result.favored_label, "Clean-shaven");
    assert.equal(result.evidence.option_a.label, "Short beard");
    assert.equal(result.evidence.option_b.label, "Clean-shaven");
  });
});

describe("Personal Experiments input validation", () => {
  it("requires two distinct named options", () => {
    const valid = validatePersonalExperimentDefinition({
      title: "Facial hair",
      option_a_label: "Short beard",
      option_b_label: "Clean-shaven",
      metric_label: "confidence"
    });
    assert.equal(valid.ok, true);
    const invalid = validatePersonalExperimentDefinition({
      title: "Facial hair",
      option_a_label: "Short beard",
      option_b_label: "Short beard"
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.error, "experiment_options_must_differ");
  });

  it("accepts only an a/b option and an integer 1-5 score", () => {
    assert.equal(
      validatePersonalExperimentOutcome({ experiment_id: 7, option_key: "a", score: 5 }).ok,
      true
    );
    assert.equal(
      validatePersonalExperimentOutcome({ experiment_id: 7, option_key: "c", score: 5 }).ok,
      false
    );
    assert.equal(
      validatePersonalExperimentOutcome({ experiment_id: 7, option_key: "a", score: 5.5 }).ok,
      false
    );
  });
});
