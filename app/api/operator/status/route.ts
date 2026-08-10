import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { ensureOperatorSchema } from "../../../../lib/operatorAgent";
import { getOperatorToolRegistry, projectContextRead } from "../../../../lib/operatorTools";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.RMF_OPERATOR_SIGNAL_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await ensureOperatorSchema();
  const sql = db();
  const [signals, runs, approvals, ledger, receipts, projects, gpts, runtimeContext] = await Promise.all([
    sql`select * from rmf_agent_signals order by created_at desc limit 20`,
    sql`select * from rmf_agent_runs order by created_at desc limit 20`,
    sql`select * from rmf_agent_approvals where status='pending' order by created_at desc limit 20`,
    sql`select * from rmf_agent_ledger order by created_at desc limit 60`,
    sql`select * from rmf_agent_receipts order by created_at desc limit 20`,
    sql`select * from rmf_agent_projects order by id`,
    sql`select * from rmf_agent_gpts order by id`,
    projectContextRead()
  ]);

  return NextResponse.json({
    ok: true,
    harness: {
      version: "closure-native-v1",
      max_authority: Number(process.env.RMF_OPERATOR_MAX_AUTHORITY || 1),
      model: process.env.RMF_OPERATOR_MODEL || "openai/gpt-5.6-terra",
      ai_gateway_configured: Boolean(process.env.AI_GATEWAY_API_KEY),
      tools: getOperatorToolRegistry(),
      runtime: runtimeContext
    },
    projects,
    gpts,
    signals,
    runs,
    approvals,
    receipts,
    ledger
  });
}
