import { NextRequest, NextResponse } from "next/server";
import {
  completePersonalAgentAction,
  decidePersonalAgentAction,
  readPersonalAgentRuns,
  runPersonalAgent
} from "../../../lib/personalIntelligence";
import { boundedText, positiveId, validateAgentGoal } from "../../../lib/personalIntelligenceEvidence";
import { runMeteredPersonalIntelligenceAction } from "../../../lib/personalIntelligenceRoute";
import { currentOAuthUser } from "../../../lib/supabaseAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

type AgentOperation = "run" | "decide" | "complete";

export async function GET(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required", message: "Personal Agent requires sign-in." }, { status: 401 });
  }
  const rawId = request.nextUrl.searchParams.get("run_id");
  const runId = rawId == null ? null : positiveId(rawId);
  if (rawId != null && !runId) return NextResponse.json({ ok: false, error: "invalid_run_id" }, { status: 400 });
  const limit = Number(request.nextUrl.searchParams.get("limit") || 20);
  return runMeteredPersonalIntelligenceAction(user.id, "personal_agent:read", async () => {
    const runs = await readPersonalAgentRuns(user.id, { run_id: runId, limit });
    return { body: { ok: true, ...(runId == null ? { runs } : { run: runs[0] || null }) } };
  });
}

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required", message: "Personal Agent requires sign-in." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const operation = body.operation as AgentOperation;
  if (operation !== "run" && operation !== "decide" && operation !== "complete") {
    return NextResponse.json({ ok: false, error: "invalid_operation" }, { status: 400 });
  }
  if (body.consent_agent !== true) {
    return NextResponse.json(
      { ok: false, error: "consent_agent_required", message: "Personal Agent runs and decisions require consent_agent=true." },
      { status: 400 }
    );
  }
  let value: Record<string, unknown>;
  if (operation === "run") {
    const validation = validateAgentGoal(body);
    if (!validation.ok) return NextResponse.json(validation, { status: 400 });
    value = validation.value;
  } else if (operation === "decide") {
    const runId = positiveId(body.run_id);
    const actionId = positiveId(body.action_id);
    if (!runId || !actionId || typeof body.approve !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "invalid_agent_decision", message: "run_id, action_id, and boolean approve are required." },
        { status: 400 }
      );
    }
    value = { run_id: runId, action_id: actionId, approve: body.approve };
  } else {
    const runId = positiveId(body.run_id);
    const actionId = positiveId(body.action_id);
    const evidenceRef = boundedText(body.evidence_ref, 120);
    const outcomeSummary = boundedText(body.outcome_summary, 500);
    if (!runId || !actionId || !evidenceRef || !outcomeSummary) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_agent_completion",
          message: "run_id, action_id, evidence_ref, and outcome_summary are required."
        },
        { status: 400 }
      );
    }
    value = { run_id: runId, action_id: actionId, evidence_ref: evidenceRef, outcome_summary: outcomeSummary };
  }
  return runMeteredPersonalIntelligenceAction(user.id, `personal_agent:${operation}`, async () => {
    const result =
      operation === "run"
        ? await runPersonalAgent(user.id, String(value.goal))
        : operation === "decide"
          ? await decidePersonalAgentAction(
              user.id,
              value as { run_id: number; action_id: number; approve: boolean }
            )
          : await completePersonalAgentAction(
              user.id,
              value as { run_id: number; action_id: number; evidence_ref: string; outcome_summary: string }
            );
    const notFound = !result.ok && result.error === "agent_action_not_found";
    return { body: result as unknown as Record<string, unknown>, status: result.ok ? 200 : notFound ? 404 : 409 };
  });
}
