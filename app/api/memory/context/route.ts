import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, db, ensureMemorySchema } from "../../../../lib/db";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";
import { consumeCredits, creditBalance, ensureSignupCreditGrant, MEMORY_CONTEXT_COST } from "../../../../lib/stripeBilling";
import { recordLearningWrite } from "../../../../lib/accountLearningPipeline";
import {
  clearAccountLearningStores,
  readContextUnified,
  syncLegacyContextToPersonal
} from "../../../../lib/accountLearningSync";

async function requireUser(request: NextRequest) { return currentOAuthUser(request); }
function creditsRequired(balance: number) { return NextResponse.json({ ok: false, error: "credits_required", message: "Persistent Rate My Face memory uses metered credits. The preference was not saved or loaded. Buy credits with createCreditCheckoutSession, then retry.", required_credits: MEMORY_CONTEXT_COST, balance, checkout_action: "createCreditCheckoutSession" }, { status: 402 }); }
async function charge(userId: string, action: string) {
  await ensureSignupCreditGrant(userId);
  const result = await consumeCredits(userId, MEMORY_CONTEXT_COST, action);
  return result.ok ? null : creditsRequired(result.balance);
}

export async function POST(request: NextRequest) {
  const user = await requireUser(request); if (!user) return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})); const consent = body.consent_personalization === true; const context = body.context && typeof body.context === "object" ? body.context : {};
  if (!consent) return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });
  const denied = await charge(user.id, "saveUserContext"); if (denied) return denied;
  // Dual-write: legacy store first, then mirror into Personal Network (canonical).
  await ensureMemorySchema(); const sql = db();
  await sql`insert into rmf_users (id, consent_personalization, updated_at) values (${user.id}, true, now()) on conflict (id) do update set consent_personalization = true, updated_at = now()`;
  await sql`insert into rmf_user_context (user_id, context, updated_at) values (${user.id}, ${sql.json(context)}, now()) on conflict (user_id) do update set context = excluded.context, updated_at = now()`;
  await syncLegacyContextToPersonal(user.id, context as Record<string, unknown>);
  const pipeline = await recordLearningWrite({
    userId: user.id,
    kind: "preference",
    data: context as Record<string, unknown>,
    requireMeaningfulPreference: true
  });
  return NextResponse.json({
    ok: true,
    saved: true,
    credits_remaining: await creditBalance(user.id),
    credits_charged: MEMORY_CONTEXT_COST,
    interaction_id: pipeline.interaction?.id ?? null,
    recommendation_id: pipeline.recommendation?.id ?? null
  });
}

export async function GET(request: NextRequest) {
  const user = await requireUser(request); if (!user) return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  const denied = await charge(user.id, "getUserContext"); if (denied) return denied;
  const resolved = await readContextUnified(user.id);
  const credits = await creditBalance(user.id);
  if (!resolved.found) return NextResponse.json({ ok: true, found: false, context: null, credits_remaining: credits, credits_charged: MEMORY_CONTEXT_COST });
  return NextResponse.json({ ok: true, found: true, ...resolved.row, credits_remaining: credits, credits_charged: MEMORY_CONTEXT_COST });
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser(request); if (!user) return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  await clearAccountLearningStores(user.id);
  return NextResponse.json({ ok: true, deleted: true });
}
