import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const home = read("app/page.tsx");
const account = read("app/account/page.tsx");
const checkout = read("app/api/billing/credits/checkout/route.ts");
const offer = read("app/api/billing/credits/offer/route.ts");
const auth = read("lib/supabaseAuth.ts");

describe("customer credit portal", () => {
  it("routes customers through their account instead of an unattributed payment link", () => {
    assert.match(home, /href="\/account"/);
    assert.doesNotMatch(home, /buy\.stripe\.com/);
    assert.match(account, /signInWithOtp/);
    assert.match(account, /\/api\/billing\/entitlements/);
    assert.match(account, /checkout\?source=web_account/);
  });

  it("preserves user attribution from authenticated checkout through Stripe metadata", () => {
    assert.match(checkout, /client_reference_id: user\.id/);
    assert.match(checkout, /rmf_user_id: user\.id/);
    assert.match(checkout, /purchase_type: "credits"/);
    assert.match(checkout, /checkout_source: checkoutSource/);
    assert.match(checkout, /account\?checkout=success/);
  });

  it("uses the configured live Stripe price instead of a UI hardcode", () => {
    assert.match(offer, /prices\.retrieve\(creditsPriceId\(\)\)/);
    assert.match(home, /creditsPerPack\(\)/);
    assert.match(account, /\/api\/billing\/credits\/offer/);
    assert.doesNotMatch(account, /\$4\.99/);
    assert.doesNotMatch(home, /\$4\.99/);
  });

  it("validates browser Supabase tokens with the supported user endpoint", () => {
    assert.match(auth, /\/auth\/v1\/user/);
    assert.match(auth, /apikey: key/);
    assert.match(auth, /data\?\.id/);
  });
});
