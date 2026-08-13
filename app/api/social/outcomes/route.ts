import { NextRequest, NextResponse } from "next/server";
import { getSocialOutcomeIntelligence, recordSocialOutcome } from "../../../../lib/personalIntelligence";
import { validateSocialOutcome } from "../../../../lib/personalIntelligenceEvidence";
import { runMeteredPersonalIntelligenceAction } from "../../../../lib/personalIntelligenceRoute";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required", message: "Social outcome intelligence requires sign-in." }, { status: 401 });
  }
  return runMeteredPersonalIntelligenceAction(user.id, "social_outcomes:read", async () => ({
    body: { ok: true, intelligence: await getSocialOutcomeIntelligence(user.id) }
  }));
}

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required", message: "Social outcome intelligence requires sign-in." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.consent_social_outcome !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "consent_social_outcome_required",
        message: "Recording a social metric requires consent_social_outcome=true."
      },
      { status: 400 }
    );
  }
  const validation = validateSocialOutcome(body);
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });
  return runMeteredPersonalIntelligenceAction(user.id, "social_outcomes:record", async () => {
    const result = await recordSocialOutcome(user.id, validation.value);
    return { body: result as unknown as Record<string, unknown>, status: result.ok ? 200 : 409 };
  });
}
