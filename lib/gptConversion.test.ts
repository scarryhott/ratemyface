/**
 * Conversion contracts: same-turn credit checkout, OpenAPI 2.5.4, conversation starters.
 * Run: node --experimental-strip-types --test lib/gptConversion.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { entitlementsCheckoutFields } from "./entitlementsCheckout.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function operationDescription(openapi: string, operationId: string): string {
  const idx = openapi.indexOf(`operationId: "${operationId}"`);
  assert.ok(idx >= 0, `missing operationId ${operationId}`);
  const slice = openapi.slice(idx, idx + 1200);
  const match = slice.match(/description:\s*\n\s*"([^"]+)"/);
  assert.ok(match, `missing description for ${operationId}`);
  return match[1];
}

describe("GPT_INSTRUCTIONS same-turn checkout", () => {
  const instructions = read("GPT_INSTRUCTIONS.md");

  it("stays within the Custom GPT paste limit and keeps the MUST retrieve block", () => {
    assert.ok(instructions.length <= 7900, `GPT_INSTRUCTIONS.md is ${instructions.length} chars`);
    assert.match(instructions, /^# MUST — Preference \/ memory questions \(same turn, before any answer\)/m);
    assert.match(instructions, /Immediately call `getPersonalNetwork` `mode=profile`/);
    assert.match(instructions, /Do NOT answer first\. Do NOT web search/);
  });

  it("requires same-turn createCreditCheckoutSession on 402 and never waits for a second yes", () => {
    assert.match(
      instructions,
      /\*\*MUST\*\* call `createCreditCheckoutSession` in this same turn/
    );
    assert.match(instructions, /Do not wait for a second yes/);
    assert.match(instructions, /Credits apply after the verified Stripe webhook/);
    assert.match(instructions, /not after Checkout redirect/);
    assert.match(instructions, /Never collect card numbers/);
    assert.equal(/Only if the user wants to buy/i.test(instructions), false);
    assert.equal(/offer checkout only if they want to buy/i.test(instructions), false);
  });

  it("lists buy-credits, balance, and product conversation starters", () => {
    assert.match(instructions, /I want to buy Rate My Face credits/);
    assert.match(instructions, /How many Rate My Face credits do I have\?/);
    assert.match(instructions, /Recommend a product for my look/);
  });

  it("keeps searchProduct free and tagged-link paste rules", () => {
    assert.match(instructions, /MUST call `searchProduct` \(\*\*FREE\*\*\)/);
    assert.match(instructions, /paste `affiliate_url` unchanged/);
    assert.match(instructions, /\(paid link\)/);
  });
});

describe("conversation starters in paste lists", () => {
  it("README and CUSTOM_GPT_INSTRUCTIONS include the buy starter", () => {
    const readme = read("README.md");
    const custom = read("CUSTOM_GPT_INSTRUCTIONS.md");
    for (const text of [readme, custom]) {
      assert.match(text, /I want to buy Rate My Face credits/);
      assert.match(text, /How many Rate My Face credits do I have\?/);
      assert.match(text, /Recommend a product for my look/);
    }
  });
});

describe("OpenAPI 2.5.4 conversion descriptions", () => {
  const openapi = read("app/api/openapi/route.ts");
  const health = read("app/api/health/route.ts");

  it("bumps schema version to 2.5.4", () => {
    assert.match(openapi, /version:\s*"2\.5\.4"/);
    assert.match(health, /openapi_version:\s*"2\.5\.4"/);
    assert.equal(openapi.includes("2.5.3"), false);
  });

  it("keeps createCreditCheckoutSession and getEntitlements descriptions ≤300 chars and auto-invoke ready", () => {
    const checkout = operationDescription(openapi, "createCreditCheckoutSession");
    const entitlements = operationDescription(openapi, "getEntitlements");
    assert.ok(checkout.length <= 300, `createCreditCheckoutSession desc is ${checkout.length}`);
    assert.ok(entitlements.length <= 300, `getEntitlements desc is ${entitlements.length}`);
    assert.match(checkout, /MUST call in the SAME turn/);
    assert.match(checkout, /402/);
    assert.match(checkout, /buy Rate My Face credits/);
    assert.match(checkout, /Never collect cards/);
    assert.match(checkout, /webhook/);
    assert.equal(/user wants to buy credits/i.test(checkout), false);
    assert.match(entitlements, /MUST call when the user asks credit balance/);
    assert.match(entitlements, /checkout_action=createCreditCheckoutSession/);
  });

  it("tells Thinking to always call free searchProduct and paste affiliate_url", () => {
    const product = operationDescription(openapi, "searchProduct");
    assert.match(product, /MUST call for every product/);
    assert.match(product, /FREE/);
    assert.match(product, /affiliate_url/);
    assert.match(product, /\(paid link\)/);
  });
});

describe("entitlementsCheckoutFields", () => {
  const costs = { personal_network: 1, memory_context: 1, report: 5 };

  it("includes checkout_action and pack size when balance is 0 or below next metered cost", () => {
    const zero = entitlementsCheckoutFields(0, 100, costs);
    assert.equal(zero.checkout_needed, true);
    assert.equal(zero.checkout_action, "createCreditCheckoutSession");
    assert.equal(zero.credit_pack_size, 100);
    assert.equal(zero.next_metered_cost, 1);
  });

  it("omits checkout_action when balance covers the next metered Action", () => {
    const funded = entitlementsCheckoutFields(92, 100, costs);
    assert.equal(funded.checkout_needed, false);
    assert.equal("checkout_action" in funded, false);
    assert.equal(funded.credit_pack_size, 100);
    assert.equal(funded.next_metered_cost, 1);
  });

  it("is wired into the entitlements route", () => {
    const route = read("app/api/billing/entitlements/route.ts");
    assert.match(route, /entitlementsCheckoutFields/);
    assert.match(route, /from \"\.\.\/\.\.\/\.\.\/\.\.\/lib\/entitlementsCheckout\"/);
    const helper = read("lib/entitlementsCheckout.ts");
    assert.match(helper, /checkout_action: \"createCreditCheckoutSession\"/);
  });
});
