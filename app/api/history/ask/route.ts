import { NextRequest, NextResponse } from "next/server";
import { askMyHistory } from "../../../../lib/personalIntelligence";
import { validateHistoryQuestion } from "../../../../lib/personalIntelligenceEvidence";
import { runMeteredPersonalIntelligenceAction } from "../../../../lib/personalIntelligenceRoute";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "oauth_required", message: "Ask My History requires sign-in." },
      { status: 401 }
    );
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const validation = validateHistoryQuestion(body);
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });
  return runMeteredPersonalIntelligenceAction(user.id, "personal_history:ask", async () => ({
    body: {
      ok: true,
      question: validation.value.question,
      answer: await askMyHistory(user.id, validation.value.question, validation.value.limit)
    }
  }));
}
