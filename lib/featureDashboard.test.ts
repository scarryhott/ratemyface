import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(ROOT, "app/dashboard/page.tsx"), "utf8");
const dashboard = JSON.parse(readFileSync(join(ROOT, "data/dashboard.json"), "utf8")) as {
  vital_stats: Array<{ label: string; value: string | number; note: string }>;
  features: Array<{ name: string; status: string; tone: string; stats: string[] }>;
};

describe("public feature dashboard", () => {
  it("renders only vital stats and feature status sections", () => {
    assert.match(page, /Vital stats/);
    assert.match(page, /Current feature status/);
    assert.match(page, /Planned/);
    for (const removed of [
      "Growth Dashboard",
      "Integrations",
      "Current A/B experiment",
      "Next actions",
      "Daily reports"
    ]) {
      assert.equal(page.includes(removed), false, `legacy section remains: ${removed}`);
    }
  });

  it("keeps implementation states distinct from planned and unconfigured states", () => {
    const names = new Set(dashboard.features.map((feature) => feature.name));
    assert.equal(names.size, dashboard.features.length);
    assert.equal(dashboard.features.filter((feature) => feature.status === "LIVE").length, 3);
    assert.equal(dashboard.features.filter((feature) => feature.status === "PAID").length, 9);
    assert.equal(dashboard.features.filter((feature) => feature.status === "READY").length, 0);
    assert.equal(dashboard.features.filter((feature) => feature.status === "NOT CONFIGURED").length, 1);
    assert.equal(dashboard.features.filter((feature) => feature.status === "PLANNED").length, 0);
  });

  it("uses verified database snapshot values for vital stats", () => {
    const stats = Object.fromEntries(dashboard.vital_stats.map((stat) => [stat.label, stat.value]));
    assert.equal(stats["Available now"], 12);
    assert.equal(stats["Account users"], 1);
    assert.equal(stats["Saved history"], 4);
    assert.equal(stats["Credit balance"], 92);
    assert.equal(stats["Compare results"], 1);
    assert.equal(stats["Credits purchased"], 0);
  });

  it("shows merged metered features as paid rather than open-PR ready", () => {
    const whatWorks = dashboard.features.find((feature) => feature.name === "What Works For Me");
    const experiments = dashboard.features.find((feature) => feature.name === "Personal Experiments");
    assert.equal(whatWorks?.status, "PAID");
    assert.equal(experiments?.status, "PAID");
    assert.ok(experiments?.stats.includes("2 outcomes per option"));
  });

  it("shows deployed personal intelligence Actions as paid and MCP as unconfigured", () => {
    for (const name of [
      "Ask My History",
      "Outcome-aware Product Learning",
      "Social Outcome Intelligence",
      "Reference Comparison",
      "Autonomous Personal Agent"
    ]) {
      assert.equal(dashboard.features.find((feature) => feature.name === name)?.status, "PAID");
    }
    const mcp = dashboard.features.find((feature) => feature.name === "Personal Network / MCP Expansion");
    assert.equal(mcp?.status, "NOT CONFIGURED");
    assert.ok(mcp?.stats.includes("User scope missing"));
  });

  it("reflects the live TikTok OAuth connector without claiming a connected account", () => {
    const social = dashboard.features.find((feature) => feature.name === "Social OAuth");
    assert.equal(social?.status, "LIVE");
    assert.ok(social?.stats.includes("TikTok configured"));
    assert.ok(social?.stats.includes("0 connected"));
  });
});
