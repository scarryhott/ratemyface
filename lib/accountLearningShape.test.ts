/**
 * Smoke tests for Account Learning preference payload shaping.
 * Run: node --experimental-strip-types --test lib/accountLearningShape.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasPreferencePayload, shapePersonalProfilePayload } from "./accountLearningShape.ts";

describe("hasPreferencePayload", () => {
  it("rejects null/empty/consent-only", () => {
    assert.equal(hasPreferencePayload(null), false);
    assert.equal(hasPreferencePayload({}), false);
    assert.equal(hasPreferencePayload({ preferences: {} }), false);
    assert.equal(hasPreferencePayload({ consent_personalization: true }), false);
  });

  it("accepts nested or flat prefs", () => {
    assert.equal(hasPreferencePayload({ preferences: { look: "natural" } }), true);
    assert.equal(hasPreferencePayload({ look: "natural", consent_personalization: true }), true);
  });
});

describe("shapePersonalProfilePayload", () => {
  it("normalizes missing row to found=false with empty preferences object", () => {
    const shaped = shapePersonalProfilePayload(null);
    assert.equal(shaped.found, false);
    assert.equal(shaped.empty, true);
    assert.deepEqual(shaped.preferences, {});
    assert.deepEqual(shaped.profile, { preferences: {} });
    assert.match(String(shaped.message), /No stored/);
  });

  it("normalizes empty profile row the same way (not data:null ambiguity)", () => {
    const shaped = shapePersonalProfilePayload({ profile: {}, updated_at: "2026-01-01" });
    assert.equal(shaped.found, false);
    assert.equal(shaped.empty, true);
    assert.deepEqual(shaped.preferences, {});
  });

  it("returns found prefs after dual-write style profile", () => {
    const shaped = shapePersonalProfilePayload({
      profile: {
        preferences: { look: "natural professional", beard: "short" },
        consent_personalization: true
      },
      updated_at: "2026-08-12"
    });
    assert.equal(shaped.found, true);
    assert.equal(shaped.empty, false);
    assert.equal((shaped.preferences as Record<string, unknown>).look, "natural professional");
    assert.equal((shaped.preferences as Record<string, unknown>).beard, "short");
    assert.equal((shaped.profile as Record<string, unknown>).consent_personalization, true);
  });
});
