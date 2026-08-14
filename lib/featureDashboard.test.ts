import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(ROOT, "app/dashboard/page.tsx"), "utf8");
const dashboard = JSON.parse(readFileSync(join(ROOT, "data/dashboard.json"), "utf8")) as {
  summary: { status: string; goal: string };
  metrics: Record<string, number | null>;
  action_classification: Record<string, string>;
};

describe("public evidence dashboard", () => {
  it("renders current metrics, the Action surface, and purchase closure", () => {
    assert.match(page, /Vital stats/);
    assert.match(page, /Action surface/);
    assert.match(page, /Purchase closure/);
    assert.match(page, /Purchase closure not proven/);
    assert.doesNotMatch(page, /dashboard\.features/);
    assert.doesNotMatch(page, /dashboard\.vital_stats/);
  });

  it("uses the current evidence schema produced by the daily growth refresh", () => {
    assert.equal(typeof dashboard.summary.goal, "string");
    assert.equal(dashboard.metrics.stripe_checkout_sessions_observed, 0);
    assert.equal(dashboard.metrics.lifetime_credits_purchased, 0);
    assert.equal(dashboard.metrics.mrr, 0);
    assert.match(dashboard.summary.status, /purchase_closure_unverified/);
  });

  it("keeps free, paid, payment, and account operations distinct", () => {
    const classes = Object.values(dashboard.action_classification);
    assert.equal(classes.filter((value) => value === "FREE").length, 1);
    assert.equal(classes.filter((value) => value === "PAID").length, 18);
    assert.equal(classes.filter((value) => value === "PAYMENT-INFRASTRUCTURE").length, 2);
    assert.equal(classes.filter((value) => value === "ACCOUNT/SECURITY").length, 1);
    assert.equal(dashboard.action_classification.searchProduct, "FREE");
    assert.equal(dashboard.action_classification.createCreditCheckoutSession, "PAYMENT-INFRASTRUCTURE");
  });

  it("never treats bootstrap-credit use as purchase proof", () => {
    assert.ok((dashboard.metrics.lifetime_credits_spent ?? 0) > 0);
    assert.equal(dashboard.metrics.lifetime_credits_purchased, 0);
    assert.match(page, /bootstrap-credit spending alone does not close this funnel/);
  });
});
