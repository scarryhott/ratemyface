/**
 * Execution-bearing managerial loop — no live DB required.
 * Run: node --experimental-strip-types --test lib/agentFeatureBacklog.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FEATURE_BACKLOG_SPEC,
  KNOWN_OPENAPI_OPERATIONS,
  classifyCycle,
  decideManagerialAction,
  deriveBacklog,
  heartbeatIdempotencyKey,
  heartbeatIsNotFeatureProgress,
  inspectRepoEvidence,
  isFeatureProgress,
  newFeatureReceipt,
  selectHighestPriorityUnfinished,
  verifyFeatureAgainstHealth,
  type FeatureReceipt,
  type ProductionHealthEvidence,
  type RepoEvidence
} from "./agentFeatureBacklog.ts";
import { COMPARE_ME_TO_ME } from "./compareFeature.ts";
import { APPEARANCE_AGENT } from "./appearanceAgent.ts";
import { SOCIAL_PROVIDER_OAUTH } from "./providerConnections.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function evidence(overrides: Partial<RepoEvidence> = {}): RepoEvidence {
  return inspectRepoEvidence({
    github_write_configured: true,
    production_url: "https://example.vercel.app",
    max_authority: 2,
    ...overrides
  });
}

function shippedReceipt(itemId: FeatureReceipt["item_id"]): FeatureReceipt {
  return newFeatureReceipt({
    item_id: itemId,
    kind: "production_verify",
    verified: true,
    advances_backlog: true,
    run_id: 1,
    signal_id: 1,
    external_ref: "https://example.vercel.app/api/health",
    blocked_on: null,
    detail: {}
  });
}

const liveHealth: ProductionHealthEvidence = {
  reachable: true,
  status: 200,
  target: "https://example.vercel.app/api/health",
  account_learning_retrieve_action: "getPersonalNetwork",
  compare_enabled: true,
  appearance_enabled: true,
  social_enabled: false
};

describe("versioned feature backlog", () => {
  it("JSON file matches the in-code spec Harry specified", () => {
    const file = JSON.parse(readFileSync(join(ROOT, "operator/FEATURE_BACKLOG.json"), "utf8"));
    assert.equal(file.version, FEATURE_BACKLOG_SPEC.version);
    assert.deepEqual(
      file.items.map((i: { id: string; priority: number }) => [i.id, i.priority]),
      FEATURE_BACKLOG_SPEC.items.map((i) => [i.id, i.priority])
    );
    assert.deepEqual(
      file.items.map((i: { id: string }) => i.id),
      ["account_learning", "compare_me_to_me", "appearance_agent", "social_oauth"]
    );
  });

  it("OpenAPI contains the operations the backlog treats as evidence", () => {
    const openapi = readFileSync(join(ROOT, "app/api/openapi/route.ts"), "utf8");
    for (const op of KNOWN_OPENAPI_OPERATIONS) {
      assert.match(openapi, new RegExp(`operationId:\\s*"${op}"`));
    }
    assert.match(openapi, /compareMeToMe/);
    assert.match(openapi, /appearancePlan/);
    assert.match(openapi, /appearanceCheckin/);
    assert.equal(openapi.includes("appearanceAgent"), false);
  });
});

describe("heartbeat is not feature progress", () => {
  it("heartbeat-only classify is a no-op cycle with no feature progress", () => {
    const decision = decideManagerialAction({
      evidence: evidence(),
      receipts: [],
      production: liveHealth,
      admittedAuthority: 2
    });
    const cycle = classifyCycle({ decision, heartbeatOnly: true });
    assert.equal(cycle.outcome, "noop_failed");
    assert.equal(cycle.feature_progress, false);
    assert.equal(heartbeatIsNotFeatureProgress(), false);
    assert.equal(isFeatureProgress("heartbeat"), false);
    assert.equal(isFeatureProgress(cycle.outcome), false);
  });

  it("a heartbeat receipt never advances the backlog", () => {
    const receipt = newFeatureReceipt({
      item_id: "account_learning",
      kind: "heartbeat",
      verified: true,
      advances_backlog: true,
      run_id: 9,
      signal_id: 9,
      external_ref: "heartbeat",
      blocked_on: null,
      detail: { heartbeat: true }
    });
    assert.equal(receipt.advances_backlog, false);
    const items = deriveBacklog(evidence(), [receipt], liveHealth);
    assert.equal(items[0].loop_status, "pending_verification");
    assert.notEqual(items[0].loop_status, "shipped");
  });

  it("run/signal counts are not used to mark items shipped", () => {
    const source = readFileSync(join(ROOT, "lib/agentFeatureBacklog.ts"), "utf8");
    assert.match(source, /not heartbeat or run counts/);
    assert.equal(source.includes("agent_runs_7d"), false);
    const items = deriveBacklog(evidence(), [], liveHealth);
    assert.ok(items.every((item) => item.loop_status !== "shipped"));
  });
});

describe("backlog advances only on verified production receipt", () => {
  it("dispatch receipt does not ship the item", () => {
    const receipt = newFeatureReceipt({
      item_id: "appearance_agent",
      kind: "implementation_dispatch",
      verified: true,
      advances_backlog: true,
      run_id: 3,
      signal_id: 3,
      external_ref: "refs/heads/agent/run-3-appearance_agent-dispatch",
      blocked_on: null,
      detail: {}
    });
    assert.equal(receipt.advances_backlog, false);
    const items = deriveBacklog(evidence(), [receipt], liveHealth);
    const appearance = items.find((i) => i.id === "appearance_agent");
    assert.equal(appearance?.loop_status, "in_flight");
    const decision = decideManagerialAction({
      evidence: evidence(),
      receipts: [shippedReceipt("account_learning"), shippedReceipt("compare_me_to_me"), receipt],
      production: liveHealth,
      admittedAuthority: 2
    });
    assert.equal(decision.action, "blocked");
    assert.equal(decision.blocked_on, "tests");
    assert.equal(decision.selected_item?.id, "appearance_agent");
  });

  it("unverified production check does not ship", () => {
    const receipt = newFeatureReceipt({
      item_id: "account_learning",
      kind: "production_verify",
      verified: false,
      advances_backlog: true,
      run_id: 4,
      signal_id: 4,
      external_ref: "/api/health",
      blocked_on: null,
      detail: {}
    });
    assert.equal(receipt.advances_backlog, false);
    const items = deriveBacklog(evidence(), [receipt], liveHealth);
    assert.equal(items[0].loop_status, "pending_verification");
  });

  it("verified production receipt ships only that item", () => {
    const items = deriveBacklog(evidence(), [shippedReceipt("account_learning")], liveHealth);
    assert.equal(items[0].id, "account_learning");
    assert.equal(items[0].loop_status, "shipped");
    assert.equal(items[1].loop_status, "pending_verification");
    const next = selectHighestPriorityUnfinished(items);
    assert.equal(next?.id, "compare_me_to_me");
  });
});

describe("decideManagerialAction", () => {
  it("verifies the highest-priority evidence-complete item", () => {
    const decision = decideManagerialAction({
      evidence: evidence(),
      receipts: [],
      production: liveHealth,
      admittedAuthority: 2
    });
    assert.equal(decision.action, "verify");
    assert.equal(decision.selected_item?.id, "account_learning");
    assert.equal(decision.candidate?.tool, "feature_production_verify");
    assert.equal(decision.feature_progress, false);
  });

  it("verifies Appearance after learning + compare have verified receipts", () => {
    const decision = decideManagerialAction({
      evidence: evidence(),
      receipts: [shippedReceipt("account_learning"), shippedReceipt("compare_me_to_me")],
      production: liveHealth,
      admittedAuthority: 2
    });
    assert.equal(decision.action, "verify");
    assert.equal(decision.selected_item?.id, "appearance_agent");
    assert.equal(decision.candidate?.tool, "feature_production_verify");
    assert.equal(APPEARANCE_AGENT.enabled, true);
    assert.equal(COMPARE_ME_TO_ME.enabled, true);
    assert.equal(inspectRepoEvidence().flags.appearance_agent, APPEARANCE_AGENT.enabled);
    assert.equal(inspectRepoEvidence().flags.compare_me_to_me, COMPARE_ME_TO_ME.enabled);
    assert.equal(inspectRepoEvidence().flags.social_oauth, SOCIAL_PROVIDER_OAUTH.enabled);
  });

  it("records blocked-on approval instead of observing when L2 is not admitted", () => {
    const decision = decideManagerialAction({
      evidence: evidence({ max_authority: 1, flags: { appearance_agent: false } }),
      receipts: [shippedReceipt("account_learning"), shippedReceipt("compare_me_to_me")],
      production: liveHealth,
      admittedAuthority: 1
    });
    assert.equal(decision.action, "blocked");
    assert.equal(decision.blocked_on, "approval");
    const cycle = classifyCycle({ decision, closureState: "awaiting_approval" });
    assert.equal(cycle.outcome, "blocked");
    assert.equal(cycle.feature_progress, false);
  });

  it("records blocked-on missing_secret when GitHub write is not configured", () => {
    const decision = decideManagerialAction({
      evidence: evidence({ github_write_configured: false, flags: { appearance_agent: false } }),
      receipts: [shippedReceipt("account_learning"), shippedReceipt("compare_me_to_me")],
      production: liveHealth,
      admittedAuthority: 2
    });
    assert.equal(decision.action, "blocked");
    assert.equal(decision.blocked_on, "missing_secret");
  });

  it("idles honestly when every specified item has a verified receipt", () => {
    const decision = decideManagerialAction({
      evidence: evidence({
        flags: {
          account_learning: true,
          compare_me_to_me: true,
          appearance_agent: true,
          social_oauth: true
        },
        social_credentials_configured: true
      }),
      receipts: [
        shippedReceipt("account_learning"),
        shippedReceipt("compare_me_to_me"),
        shippedReceipt("appearance_agent"),
        shippedReceipt("social_oauth")
      ],
      production: { ...liveHealth, appearance_enabled: true, social_enabled: true },
      admittedAuthority: 2
    });
    assert.equal(decision.action, "idle");
    assert.equal(decision.selected_item, null);
    const cycle = classifyCycle({ decision });
    assert.equal(cycle.outcome, "idle_no_unfinished");
    assert.equal(cycle.feature_progress, false);
  });

  it("observe-only execution against unfinished work is a failed no-op cycle", () => {
    const decision = decideManagerialAction({
      evidence: evidence(),
      receipts: [shippedReceipt("account_learning"), shippedReceipt("compare_me_to_me")],
      production: liveHealth,
      admittedAuthority: 2
    });
    const cycle = classifyCycle({
      decision,
      executedTool: "project_context_read",
      receiptVerified: true
    });
    assert.equal(decision.action, "verify");
    assert.equal(cycle.outcome, "noop_failed");
    assert.equal(cycle.feature_progress, false);
  });

  it("Social OAuth stays blocked on missing secrets and is not invented-complete", () => {
    const previousKey = process.env.TIKTOK_OAUTH_CLIENT_KEY;
    const previousSecret = process.env.TIKTOK_OAUTH_CLIENT_SECRET;
    delete process.env.TIKTOK_OAUTH_CLIENT_KEY;
    delete process.env.TIKTOK_OAUTH_CLIENT_SECRET;
    try {
      assert.equal(SOCIAL_PROVIDER_OAUTH.scraping, false);
      assert.equal(SOCIAL_PROVIDER_OAUTH.enabled, false);
      const items = deriveBacklog(
        evidence(),
        [shippedReceipt("account_learning"), shippedReceipt("compare_me_to_me"), shippedReceipt("appearance_agent")],
        liveHealth
      );
      const social = items.find((i) => i.id === "social_oauth");
      assert.equal(social?.loop_status, "blocked");
      assert.equal(social?.blocked_on, "missing_secret");
    } finally {
      if (previousKey === undefined) delete process.env.TIKTOK_OAUTH_CLIENT_KEY;
      else process.env.TIKTOK_OAUTH_CLIENT_KEY = previousKey;
      if (previousSecret === undefined) delete process.env.TIKTOK_OAUTH_CLIENT_SECRET;
      else process.env.TIKTOK_OAUTH_CLIENT_SECRET = previousSecret;
    }
  });
});

describe("production verification", () => {
  it("requires a reachable health document that matches acceptance", () => {
    const item = FEATURE_BACKLOG_SPEC.items[0];
    const miss = verifyFeatureAgainstHealth(item, { ...liveHealth, reachable: false });
    assert.equal(miss.verified, false);
    const hit = verifyFeatureAgainstHealth(item, liveHealth);
    assert.equal(hit.verified, true);
    const compare = verifyFeatureAgainstHealth(FEATURE_BACKLOG_SPEC.items[1], liveHealth);
    assert.equal(compare.verified, true);
    const appearance = verifyFeatureAgainstHealth(FEATURE_BACKLOG_SPEC.items[2], liveHealth);
    assert.equal(appearance.verified, true);
  });
});

describe("heartbeat route is enqueue-only", () => {
  it("does not run the worker, DDL, or treat success as a ship", () => {
    const route = readFileSync(join(ROOT, "app/api/operator/heartbeat/route.ts"), "utf8");
    assert.match(route, /enqueueSignalIdempotent/);
    assert.match(route, /snapshotBusinessFlags/);
    assert.match(route, /withDatabaseTimeout/);
    assert.match(route, /HEARTBEAT_DB_TIMEOUT_MS/);
    assert.match(route, /feature_progress:\s*false/);
    assert.match(route, /status:\s*signal\.duplicate \? 200 : 202/);
    assert.equal(route.includes("runOneSignal"), false);
    assert.equal(route.includes("ensureOperatorSchema"), false);
    assert.equal(route.includes("snapshotBusinessMetrics"), false);
    assert.match(heartbeatIdempotencyKey(new Date("2026-08-13T14:13:14.000Z")), /heartbeat:business_improve:2026-08-13/);
    const agent = readFileSync(join(ROOT, "lib/operatorAgent.ts"), "utf8");
    const start = agent.indexOf("export async function enqueueSignalIdempotent");
    assert.ok(start >= 0);
    const idempotent = agent.slice(start, start + 1600);
    assert.equal(idempotent.includes("ensureOperatorSchema"), false);
  });

  it("worker cron is separate from the heartbeat request", () => {
    const vercel = readFileSync(join(ROOT, "vercel.json"), "utf8");
    assert.match(vercel, /\/api\/operator\/heartbeat/);
    assert.match(vercel, /\/api\/operator\/run/);
  });
});
