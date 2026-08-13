import { NextRequest, NextResponse } from "next/server";
import { getProductLearning, recordProductOutcome } from "../../../../lib/personalIntelligence";
import { validateProductOutcome } from "../../../../lib/personalIntelligenceEvidence";
import { runMeteredPersonalIntelligenceAction } from "../../../../lib/personalIntelligenceRoute";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required", message: "Product learning requires sign-in." }, { status: 401 });
  }
  return runMeteredPersonalIntelligenceAction(user.id, "product_learning:read", async () => ({
    body: { ok: true, learning: await getProductLearning(user.id) }
  }));
}

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required", message: "Product learning requires sign-in." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.consent_product_outcome !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "consent_product_outcome_required",
        message: "Recording a product outcome requires consent_product_outcome=true."
      },
      { status: 400 }
    );
  }
  const validation = validateProductOutcome(body);
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });
  return runMeteredPersonalIntelligenceAction(user.id, "product_learning:record", async () => {
    const result = await recordProductOutcome(user.id, validation.value);
    return {
      body: result as unknown as Record<string, unknown>,
      status: result.ok ? 200 : result.error === "recommendation_not_found" ? 404 : 409
    };
  });
}
