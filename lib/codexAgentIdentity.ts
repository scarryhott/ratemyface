export const CODEX_MCP_ENTITLEMENTS = [
  "browser_health",
  "chatgpt_observe_closure",
  "browser_session",
  "browser_observe",
  "browser_receipt",
  "browser_navigate",
  "browser_owner_start",
  "browser_owner_status",
  "browser_owner_finish",
  "personal_ask_history",
  "personal_product_learning",
  "personal_social_outcomes",
  "personal_reference_comparisons",
  "personal_agent_status"
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CodexMcpIdentityConfig =
  | { ready: true; userId: string }
  | { ready: false; reason: "mcp_token_missing" | "mcp_user_id_missing" | "mcp_user_id_invalid" };

export function configuredCodexMcpIdentity(env: NodeJS.ProcessEnv = process.env): CodexMcpIdentityConfig {
  if (!(env.RMF_CHATGPT_MCP_TOKEN || "").trim()) return { ready: false, reason: "mcp_token_missing" };
  const userId = (env.RMF_CHATGPT_MCP_USER_ID || "").trim();
  if (!userId) return { ready: false, reason: "mcp_user_id_missing" };
  if (!UUID_PATTERN.test(userId)) return { ready: false, reason: "mcp_user_id_invalid" };
  return { ready: true, userId };
}

function sameEntitlements(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.length === CODEX_MCP_ENTITLEMENTS.length && CODEX_MCP_ENTITLEMENTS.every((item, index) => value[index] === item);
}

/** Links the configured server-scoped MCP identity without granting unimplemented feature access. */
export async function syncCodexMcpIdentity(sql: any) {
  const config = configuredCodexMcpIdentity();
  if (!config.ready) return { updated: false, state: config.reason } as const;

  const users = await sql`select id::text as id from auth.users where id = ${config.userId} limit 1`;
  if (!users.length) return { updated: false, state: "mcp_user_not_found" } as const;

  const rows = await sql`
    select auth_user_id::text as auth_user_id, status, feature_access, entitlements
    from rmf_control_agent_identities
    where agent_key = 'codex'
    limit 1
  `;
  const current = rows[0];
  const alreadyLinked =
    String(current?.auth_user_id || "") === config.userId &&
    current?.status === "active" &&
    current?.feature_access === "scoped" &&
    sameEntitlements(current?.entitlements);
  if (alreadyLinked) {
    return { updated: false, state: "already_linked", entitlement_count: CODEX_MCP_ENTITLEMENTS.length } as const;
  }

  await sql.begin(async (tx: any) => {
    await tx`
      update rmf_control_agent_identities
      set auth_user_id = ${config.userId},
        status = 'active',
        feature_access = 'scoped',
        entitlements = ${tx.json([...CODEX_MCP_ENTITLEMENTS] as any)},
        metadata = metadata || ${tx.json({
          scope_source: "RMF_CHATGPT_MCP_USER_ID",
          token_configured: true,
          entitlement_source: "deployed_mcp_tool_registry"
        } as any)},
        last_verified_at = now(),
        updated_at = now()
      where agent_key = 'codex'
    `;
    await tx`
      insert into rmf_control_feature_evidence(
        feature_key, evidence_type, provider, observed_state, passed,
        external_ref, payload
      ) values(
        'codex_agent_account', 'provider', 'openai', 'mcp_identity_linked', true,
        'mcp_config:codex',
        ${tx.json({
          user_scope_configured: true,
          token_configured: true,
          feature_access: "scoped",
          entitlement_count: CODEX_MCP_ENTITLEMENTS.length
        } as any)}
      )
    `;
    await tx`
      update rmf_control_features
      set lifecycle_status = 'active', access_status = 'available',
        evidence_status = 'verified', last_verified_at = now(), updated_at = now()
      where feature_key = 'codex_agent_account'
    `;
  });
  return { updated: true, state: "linked", entitlement_count: CODEX_MCP_ENTITLEMENTS.length } as const;
}
