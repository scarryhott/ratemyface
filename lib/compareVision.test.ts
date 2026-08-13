/**
 * Compare Me To Me paid Action: image-ref resolution + honest result shaping.
 * Run: node --experimental-strip-types --test lib/compareVision.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHonestCompareActionResult,
  coerceImageRef,
  httpsImageUrl,
  isPlaceholderImageRef,
  isUsableImageRef,
  looksMedical,
  parseVisionModelJson,
  resolveCompareImageRefs,
  sanitizeCompareVisionText
} from "./compareVision.ts";
import { COMPARE_ACTION, COMPARE_ACTION_COST, COMPARE_ME_TO_ME } from "./compareFeature.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("image ref resolution", () => {
  it("rejects missing refs and placeholders instead of treating them as real", () => {
    assert.equal(isPlaceholderImageRef("placeholder://account-learning/before/interaction/1"), true);
    assert.equal(isUsableImageRef("placeholder://account-learning/after"), false);
    const missing = resolveCompareImageRefs({
      body: {},
      profile: { preferences: { look: "natural" } }
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.error, "image_refs_required");
      assert.equal(missing.before_image_ref, null);
      assert.equal(missing.after_image_ref, null);
    }

    const placeholders = resolveCompareImageRefs({
      profile: {
        before_image_ref: "placeholder://account-learning/before",
        after_image_ref: "placeholder://account-learning/after"
      }
    });
    assert.equal(placeholders.ok, false);
  });

  it("accepts request HTTPS refs and profile-stored real refs", () => {
    const fromBody = resolveCompareImageRefs({
      body: {
        before_image_ref: "https://files.example.com/before.jpg",
        after_image_ref: "https://files.example.com/after.jpg",
        consent_compare: true
      }
    });
    assert.equal(fromBody.ok, true);
    if (fromBody.ok) {
      assert.equal(fromBody.source, "request");
      assert.equal(httpsImageUrl(fromBody.before_image_ref)?.startsWith("https://"), true);
    }

    const fromProfile = resolveCompareImageRefs({
      body: { consent_compare: true },
      profile: {
        before_image_ref: "https://cdn.example.com/u/before.png",
        after_image_ref: "https://cdn.example.com/u/after.png"
      }
    });
    assert.equal(fromProfile.ok, true);
    if (fromProfile.ok) assert.equal(fromProfile.source, "profile");
  });

  it("rejects a single photo reused as both before and after", () => {
    const same = resolveCompareImageRefs({
      body: {
        before_image_ref: "https://cdn.example.com/one.jpg",
        after_image_ref: "https://cdn.example.com/one.jpg"
      }
    });
    assert.equal(same.ok, false);
  });

  it("coerces nested image_url objects used by ChatGPT Actions", () => {
    assert.equal(
      coerceImageRef({ image_url: { url: "https://files.example.com/a.jpg" } }),
      "https://files.example.com/a.jpg"
    );
  });
});

describe("honest compare result", () => {
  it("does not invent products, ASINs, or medical claims when vision is limited", () => {
    const result = buildHonestCompareActionResult({
      before_image_ref: "https://cdn.example.com/before.jpg",
      after_image_ref: "https://cdn.example.com/after.jpg",
      source: "request",
      vision: { ok: false, reason: "vision_gateway_not_configured" }
    });
    assert.equal(result.score.live_vision, false);
    assert.equal(result.score.live_product, false);
    assert.equal(result.score.medical_claims, false);
    assert.equal(result.score.mode, "refs_recorded_limited");
    assert.equal(result.data.generated_product, false);
    assert.match(result.summary, /limited/i);
    assert.equal(/diagnos|treat|cure/i.test(result.summary), false);
    assert.equal(JSON.stringify(result).includes("B0"), false);
  });

  it("keeps a successful vision recap honest and strips ASINs/medical text", () => {
    assert.equal(sanitizeCompareVisionText("Try B0EXAMPLE12 cream"), "Try [redacted] cream");
    assert.equal(looksMedical("This may diagnose melanoma"), true);
    const parsed = parseVisionModelJson(
      JSON.stringify({
        summary: "Beard looks shorter and hair is neater.",
        changes: ["shorter beard", "neater hair"],
        unchanged: ["glasses"],
        limitations: ["lighting differs"]
      })
    );
    assert.equal(parsed.ok, true);
    const result = buildHonestCompareActionResult({
      before_image_ref: "https://cdn.example.com/before.jpg",
      after_image_ref: "https://cdn.example.com/after.jpg",
      source: "request",
      vision: parsed.ok ? parsed : null
    });
    assert.equal(result.score.live_vision, true);
    assert.equal(result.score.live_product, false);
    assert.equal(result.score.medical_claims, false);
    assert.match(result.summary, /Beard looks shorter/);
  });

  it("rejects vision JSON that is medical or unparseable", () => {
    assert.equal(parseVisionModelJson("{not json").ok, false);
    assert.equal(
      parseVisionModelJson(JSON.stringify({ summary: "This diagnoses a skin disease." })).ok,
      false
    );
  });
});

describe("paid action cost", () => {
  it("meters compareMeToMe at the same 1-credit unit as Personal Network", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const personal = readFileSync(join(root, "lib/personalNetwork.ts"), "utf8");
    assert.match(personal, /export const PERSONAL_ACTION_COST = 1/);
    assert.equal(COMPARE_ACTION_COST, 1);
    assert.equal(COMPARE_ACTION, "compare:me_to_me");
    assert.equal(COMPARE_ME_TO_ME.enabled, true);
    assert.equal(COMPARE_ME_TO_ME.status, "paid");
    assert.equal(COMPARE_ME_TO_ME.dashboard_status, "PAID");
    assert.equal(COMPARE_ME_TO_ME.vision_status, "limited");
  });
});
