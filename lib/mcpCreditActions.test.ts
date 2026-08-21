import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("scoped MCP credit actions", () => {
  const route = read("app/api/mcp/route.ts");
  const identity = read("lib/codexAgentIdentity.ts");
  const checkout = read("lib/creditCheckout.ts");

  it("exposes a scoped entitlement read and explicit checkout-session creation", () => {
    assert.match(route, /get_scoped_credit_entitlements/);
    assert.match(route, /create_scoped_credit_checkout_session/);
    assert.match(route, /RMF_CHATGPT_MCP_USER_ID/);
    assert.match(route, /No charge has been made/);
  });

  it("records both tools as the deployed Codex entitlement registry", () => {
    assert.match(identity, /"get_scoped_credit_entitlements"/);
    assert.match(identity, /"create_scoped_credit_checkout_session"/);
  });

  it("keeps the checkout source attributed and relies on Stripe-hosted payment", () => {
    assert.match(checkout, /mcp_credit_action/);
    assert.match(checkout, /checkout\.sessions\.create/);
    assert.match(checkout, /if \(!session\.url\) throw new Error\("checkout_url_unavailable"\)/);
  });
}
