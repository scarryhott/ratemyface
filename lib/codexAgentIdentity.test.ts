import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CODEX_MCP_ENTITLEMENTS, configuredCodexMcpIdentity } from "./codexAgentIdentity.ts";

describe("Codex MCP identity provisioning", () => {
  it("requires both the connection secret and a valid scoped user UUID", () => {
    assert.deepEqual(configuredCodexMcpIdentity({} as NodeJS.ProcessEnv), { ready: false, reason: "mcp_token_missing" });
    assert.deepEqual(
      configuredCodexMcpIdentity({ RMF_CHATGPT_MCP_TOKEN: "configured" } as NodeJS.ProcessEnv),
      { ready: false, reason: "mcp_user_id_missing" }
    );
    assert.deepEqual(
      configuredCodexMcpIdentity({ RMF_CHATGPT_MCP_TOKEN: "configured", RMF_CHATGPT_MCP_USER_ID: "not-a-uuid" } as NodeJS.ProcessEnv),
      { ready: false, reason: "mcp_user_id_invalid" }
    );
    assert.deepEqual(
      configuredCodexMcpIdentity({
        RMF_CHATGPT_MCP_TOKEN: "configured",
        RMF_CHATGPT_MCP_USER_ID: "00000000-0000-4000-8000-000000000001"
      } as NodeJS.ProcessEnv),
      { ready: true, userId: "00000000-0000-4000-8000-000000000001" }
    );
  });

  it("records only tools deployed on the current MCP surface", () => {
    const entitlements: readonly string[] = CODEX_MCP_ENTITLEMENTS;
    assert.equal(CODEX_MCP_ENTITLEMENTS.length, 16);
    assert.ok(entitlements.includes("personal_agent_status"));
    assert.ok(entitlements.includes("get_scoped_credit_entitlements"));
    assert.ok(entitlements.includes("create_scoped_credit_checkout_session"));
    assert.ok(!entitlements.includes("compare_me_to_me"));
    assert.ok(!entitlements.includes("credit_checkout"));
  });
});
