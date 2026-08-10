import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import {
  getOperatorToolRegistry,
  githubRead,
  projectContextRead
} from "../../../../lib/operatorTools";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.RMF_OPERATOR_SIGNAL_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let github: Record<string, unknown>;
  try {
    github = await githubRead();
  } catch (error) {
    github = { error: error instanceof Error ? error.message : String(error) };
  }

  return NextResponse.json({
    ok: true,
    harness: "closure-native-v1",
    security_envelope: {
      max_authority: Number(process.env.RMF_OPERATOR_MAX_AUTHORITY || 1),
      signal_auth_configured: Boolean(process.env.RMF_OPERATOR_SIGNAL_SECRET),
      cron_auth_configured: Boolean(process.env.CRON_SECRET),
      database_configured: databaseConfigured(),
      ai_gateway_configured: Boolean(process.env.AI_GATEWAY_API_KEY),
      github_write_configured: Boolean(process.env.GITHUB_OPERATOR_TOKEN)
    },
    runtime: await projectContextRead(),
    github,
    tools: getOperatorToolRegistry(),
    invariants: [
      "credentials_are_never_returned",
      "authority_is_capped_by_RMF_OPERATOR_MAX_AUTHORITY",
      "one_mutating_tool_max_per_run",
      "L2_GitHub_probe_writes_only_to_agent_run_branch",
      "L2_GitHub_probe_never_merges",
      "mutations_require_independent_readback_receipt"
    ]
  });
}
