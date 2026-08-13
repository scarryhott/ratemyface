/**
 * TikTok user-authorized OAuth + per-provider credential gates.
 * Run: node --experimental-strip-types --test lib/providerConnections.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SOCIAL_PROVIDER_OAUTH,
  anySocialProviderConfigured,
  configuredSocialProviders,
  socialProviderCredentialsConfigured,
  socialProviderNotConfiguredResponse
} from "./providerConnections.ts";
import {
  decryptTokenRef,
  encryptTokenRef,
  redactProviderSecrets,
  createTikTokOAuthState,
  parseTikTokOAuthState,
  tiktokAuthorizeUrl,
  tiktokOAuthRedirectUri
} from "./tiktokOAuth.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("socialProviderCredentialsConfigured", () => {
  it("instagram and linkedin stay false until their env exists", () => {
    withEnv(
      {
        INSTAGRAM_OAUTH_CLIENT_ID: undefined,
        INSTAGRAM_OAUTH_CLIENT_SECRET: undefined,
        LINKEDIN_OAUTH_CLIENT_ID: undefined,
        LINKEDIN_OAUTH_CLIENT_SECRET: undefined
      },
      () => {
        assert.equal(socialProviderCredentialsConfigured("instagram"), false);
        assert.equal(socialProviderCredentialsConfigured("linkedin"), false);
      }
    );
  });

  it("tiktok is true only when both client key and secret are set", () => {
    withEnv(
      {
        TIKTOK_OAUTH_CLIENT_KEY: undefined,
        TIKTOK_OAUTH_CLIENT_SECRET: undefined
      },
      () => {
        assert.equal(socialProviderCredentialsConfigured("tiktok"), false);
        assert.equal(anySocialProviderConfigured(), false);
        assert.equal(SOCIAL_PROVIDER_OAUTH.enabled, false);
        assert.equal(SOCIAL_PROVIDER_OAUTH.status, "not_configured");
      }
    );
    withEnv(
      {
        TIKTOK_OAUTH_CLIENT_KEY: "key-only",
        TIKTOK_OAUTH_CLIENT_SECRET: undefined
      },
      () => {
        assert.equal(socialProviderCredentialsConfigured("tiktok"), false);
      }
    );
    withEnv(
      {
        TIKTOK_OAUTH_CLIENT_KEY: "test-key",
        TIKTOK_OAUTH_CLIENT_SECRET: "test-secret",
        INSTAGRAM_OAUTH_CLIENT_ID: undefined,
        INSTAGRAM_OAUTH_CLIENT_SECRET: undefined,
        LINKEDIN_OAUTH_CLIENT_ID: undefined,
        LINKEDIN_OAUTH_CLIENT_SECRET: undefined
      },
      () => {
        assert.equal(socialProviderCredentialsConfigured("tiktok"), true);
        assert.equal(socialProviderCredentialsConfigured("instagram"), false);
        assert.equal(socialProviderCredentialsConfigured("linkedin"), false);
        assert.deepEqual(configuredSocialProviders(), ["tiktok"]);
        assert.equal(SOCIAL_PROVIDER_OAUTH.enabled, true);
        assert.equal(SOCIAL_PROVIDER_OAUTH.status, "configured");
        assert.equal(SOCIAL_PROVIDER_OAUTH.scraping, false);
      }
    );
  });

  it("instagram 501 stub stays not_configured even when TikTok is wired", () => {
    withEnv(
      {
        TIKTOK_OAUTH_CLIENT_KEY: "test-key",
        TIKTOK_OAUTH_CLIENT_SECRET: "test-secret"
      },
      () => {
        const stub = socialProviderNotConfiguredResponse(501, "instagram");
        assert.equal(stub.status, 501);
        assert.equal(stub.body.error, "not_configured");
        assert.equal(stub.body.scraping, false);
        assert.match(stub.body.message, /instagram/i);
      }
    );
  });
});

describe("encrypted token_ref", () => {
  it("round-trips tokens without putting plaintext in the ref", () => {
    withEnv({ TIKTOK_OAUTH_CLIENT_SECRET: "unit-test-secret" }, () => {
      const material = {
        access_token: "act.super-secret",
        refresh_token: "rft.also-secret",
        token_type: "Bearer"
      };
      const ref = encryptTokenRef(material);
      assert.equal(ref.startsWith("v1."), true);
      assert.equal(ref.includes("act.super-secret"), false);
      assert.equal(ref.includes("rft.also-secret"), false);
      const back = decryptTokenRef(ref);
      assert.deepEqual(back, material);
    });
  });

  it("redacts token-like keys", () => {
    const redacted = redactProviderSecrets({
      access_token: "act.secret",
      nested: { refresh_token: "rft.secret", open_id: "ok" }
    }) as Record<string, unknown>;
    assert.equal(redacted.access_token, "[redacted]");
    assert.equal((redacted.nested as Record<string, unknown>).refresh_token, "[redacted]");
    assert.equal((redacted.nested as Record<string, unknown>).open_id, "ok");
  });
});

describe("tiktok authorize URL and state", () => {
  it("builds Login Kit URL without putting the client secret in the URL", () => {
    withEnv(
      {
        TIKTOK_OAUTH_CLIENT_KEY: "rmf-client-key",
        TIKTOK_OAUTH_CLIENT_SECRET: "rmf-client-secret"
      },
      () => {
        const started = tiktokAuthorizeUrl("user-123");
        assert.match(started.authorize_url, /https:\/\/www\.tiktok\.com\/v2\/auth\/authorize\//);
        assert.match(started.authorize_url, /client_key=rmf-client-key/);
        assert.equal(started.authorize_url.includes("rmf-client-secret"), false);
        assert.equal(started.redirect_uri, tiktokOAuthRedirectUri());
        assert.match(started.redirect_uri, /\/api\/providers\/tiktok\/callback$/);
        const parsed = parseTikTokOAuthState(started.state);
        assert.equal(parsed?.userId, "user-123");
        assert.equal(parseTikTokOAuthState("tampered." + started.state.split(".")[1]), null);
      }
    );
  });

  it("signs state so a swapped user id is rejected", () => {
    withEnv({ TIKTOK_OAUTH_CLIENT_SECRET: "rmf-client-secret" }, () => {
      const state = createTikTokOAuthState("user-a");
      assert.equal(parseTikTokOAuthState(state)?.userId, "user-a");
      const [body] = state.split(".");
      const forged = Buffer.from(JSON.stringify({ p: "tiktok", u: "user-b", e: 9999999999, n: "x" })).toString(
        "base64url"
      );
      assert.equal(parseTikTokOAuthState(`${forged}.${state.split(".")[1]}`), null);
      void body;
    });
  });
});

describe("provider route wiring (source)", () => {
  it("connect returns TikTok authorize URL and keeps Instagram/LinkedIn on 501", () => {
    const connect = readFileSync(join(ROOT, "app/api/providers/connect/route.ts"), "utf8");
    assert.match(connect, /tiktokAuthorizeUrl/);
    assert.match(connect, /socialProviderNotConfiguredResponse\(501/);
    assert.equal(connect.includes("consumeCredits"), false);
    assert.equal(connect.includes("console.log"), false);
  });

  it("callback exchanges code, stores token_ref, and does not log raw tokens", () => {
    const callback = readFileSync(
      join(ROOT, "app/api/providers/tiktok/callback/route.ts"),
      "utf8"
    );
    assert.match(callback, /exchangeTikTokAuthorizationCode/);
    assert.match(callback, /upsertConnectedProvider/);
    assert.match(callback, /withDatabaseTimeout/);
    assert.match(callback, /PROVIDER_OAUTH_TIMEOUT_MS/);
    assert.equal(callback.includes("console.log"), false);
    assert.equal(callback.includes("console.info"), false);
    assert.equal(callback.includes("access_token"), false);
    assert.equal(callback.includes("refresh_token"), false);
  });

  it("disconnect soft-revokes when TikTok is configured", () => {
    const disconnect = readFileSync(join(ROOT, "app/api/providers/disconnect/route.ts"), "utf8");
    assert.match(disconnect, /revokeProviderConnection/);
    assert.match(disconnect, /withDatabaseTimeout/);
    assert.equal(disconnect.includes("consumeCredits"), false);
  });

  it("health lists configured_providers and keeps scraping false", () => {
    const health = readFileSync(join(ROOT, "app/api/health/route.ts"), "utf8");
    assert.match(health, /configured_providers:\s*SOCIAL_PROVIDER_OAUTH\.configured_providers/);
    assert.match(health, /enabled:\s*SOCIAL_PROVIDER_OAUTH\.enabled/);
    assert.match(health, /scraping:\s*SOCIAL_PROVIDER_OAUTH\.scraping/);
  });

  it("does not add GPT instruction paste language to OpenAPI or provider routes", () => {
    const openapi = readFileSync(join(ROOT, "app/api/openapi/route.ts"), "utf8");
    const connect = readFileSync(join(ROOT, "app/api/providers/connect/route.ts"), "utf8");
    assert.equal(openapi.includes("GPT_INSTRUCTIONS"), false);
    assert.equal(connect.includes("GPT_INSTRUCTIONS"), false);
    assert.equal(openapi.includes("g-DWbo6vHCD"), false);
  });
});
