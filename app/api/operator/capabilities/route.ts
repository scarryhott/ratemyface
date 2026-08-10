import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import { getOperatorToolRegistry, githubRead, projectContextRead } from "../../../../lib/operatorTools";
import { configuredOwnerIdentifiers, operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok:false, error:"unauthorized" }, { status:401 });

  let github: Record<string, unknown>;
  try { github = await githubRead(); }
  catch (error) { github = { error: error instanceof Error ? error.message : String(error) }; }

  const owners = configuredOwnerIdentifiers();
  return NextResponse.json({
    ok:true,
    actor:auth.actor,
    harness:"closure-native-v1",
    security_envelope:{
      max_authority:Number(process.env.RMF_OPERATOR_MAX_AUTHORITY||1),
      signal_auth_configured:Boolean(process.env.RMF_OPERATOR_SIGNAL_SECRET),
      cron_auth_configured:Boolean(process.env.CRON_SECRET),
      database_configured:databaseConfigured(),
      ai_gateway_configured:Boolean(process.env.AI_GATEWAY_API_KEY),
      github_write_configured:Boolean(process.env.GITHUB_OPERATOR_TOKEN),
      browser_control_configured:Boolean(process.env.RMF_BROWSER_CONTROL_URL && process.env.RMF_BROWSER_CONTROL_TOKEN),
      owner_auth:{google:Boolean(owners.email),phone:Boolean(owners.phone),ethereum:Boolean(owners.ethereum),solana:Boolean(owners.solana)}
    },
    runtime:await projectContextRead(),
    github,
    tools:getOperatorToolRegistry(),
    invariants:[
      "credentials_are_never_returned",
      "authority_is_capped_by_RMF_OPERATOR_MAX_AUTHORITY",
      "one_mutating_tool_max_per_run",
      "owner_identity_requires_exact_allowlist_match",
      "L2_GitHub_probe_writes_only_to_agent_run_branch",
      "L2_GitHub_probe_never_merges",
      "L2_browser_probe_is_read_only",
      "L2_browser_probe_requires_allowlisted_https_target",
      "L2_browser_probe_never_exports_cookies_passwords_or_tokens",
      "mutations_require_independent_readback_receipt"
    ]
  });
}
