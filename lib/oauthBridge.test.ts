import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configuredOAuthClients, oauthClient, validClient } from "./oauthBridge.ts";

describe("additive OAuth client registry", () => {
  const env = {
    RMF_OAUTH_CLIENT_ID: "existing-client",
    RMF_OAUTH_CLIENT_SECRET: "existing-secret",
    CHATGPT_OAUTH_REDIRECT_URI: "https://chatgpt.com/aip/existing/oauth/callback",
    RMF_OAUTH_CLIENTS: JSON.stringify([
      {
        client_id: "store-client",
        client_secret: "store-secret",
        redirect_uris: ["https://chatgpt.com/aip/store/oauth/callback"]
      }
    ])
  } as NodeJS.ProcessEnv;

  it("keeps the default client while admitting a separate GPT client", () => {
    assert.equal(configuredOAuthClients(env).length, 2);
    assert.equal(oauthClient("existing-client", env)?.clientSecret, "existing-secret");
    assert.equal(oauthClient("store-client", env)?.clientSecret, "store-secret");
  });

  it("requires each client to use its own exact redirect URI", () => {
    const previous = process.env.RMF_OAUTH_CLIENTS;
    const previousId = process.env.RMF_OAUTH_CLIENT_ID;
    const previousSecret = process.env.RMF_OAUTH_CLIENT_SECRET;
    const previousRedirect = process.env.CHATGPT_OAUTH_REDIRECT_URI;
    Object.assign(process.env, env);
    try {
      assert.equal(validClient("store-client", "https://chatgpt.com/aip/store/oauth/callback"), true);
      assert.equal(validClient("store-client", "https://chatgpt.com/aip/existing/oauth/callback"), false);
    } finally {
      process.env.RMF_OAUTH_CLIENTS = previous;
      process.env.RMF_OAUTH_CLIENT_ID = previousId;
      process.env.RMF_OAUTH_CLIENT_SECRET = previousSecret;
      process.env.CHATGPT_OAUTH_REDIRECT_URI = previousRedirect;
    }
  });
});
