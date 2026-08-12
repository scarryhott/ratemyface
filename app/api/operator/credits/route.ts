import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";
import {
  creditAccountOverview,
  grantCredits,
  revokeCredits,
  signupCredits
} from "../../../../lib/stripeBilling";

export const runtime = "nodejs";

function randomRef(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  const userId = String(request.nextUrl.searchParams.get("user_id") || "").trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  }

  const overview = await creditAccountOverview(userId);
  return NextResponse.json({
    ok: true,
    actor: auth.actor,
    product_credits_label: overview.label,
    signup_bootstrap_credits: signupCredits(),
    note: "Same Stripe ledger as grantCredits / consumeCredits / revokeCredits (rmf_credit_accounts + rmf_credit_ledger). Not Vercel Hobby or AI Gateway.",
    account: overview
  });
}

/**
 * Founder grant or audited revoke into the product credit ledger.
 * Body: { user_id, amount, note?, action?: "grant"|"revoke", external_ref? }
 * Every mutation writes rmf_credit_ledger — no silent balance edits.
 */
export async function POST(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const userId = String(body.user_id || "").trim();
  const amount = Number(body.amount ?? body.delta);
  const note = String(body.note || "").slice(0, 500);
  const action = String(body.action || "grant").toLowerCase();

  if (!userId) return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "positive_integer_amount_required" }, { status: 400 });
  }
  if (amount > 100_000) {
    return NextResponse.json({ ok: false, error: "amount_too_large" }, { status: 400 });
  }

  if (action === "revoke") {
    const externalRef = String(body.external_ref || randomRef("operator_revoke")).slice(0, 200);
    const result = await revokeCredits(userId, amount, externalRef, {
      note,
      actor: auth.actor || "operator",
      owner_id: auth.owner?.id || null,
      product: "rate_my_face_stripe_ledger",
      source: "operator_revoke"
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "insufficient_balance",
          balance: result.balance,
          note: "Revoke refused — balance too low. No ledger row written."
        },
        { status: 409 }
      );
    }
    const overview = await creditAccountOverview(userId);
    return NextResponse.json({
      ok: true,
      actor: auth.actor,
      action: "revoke",
      amount,
      balance: result.balance,
      external_ref: externalRef,
      product_credits_label: overview.label,
      note: "Audited revoke via revokeCredits → rmf_credit_ledger reason=operator_revoke. Not Vercel.",
      account: overview
    });
  }

  if (action !== "grant") {
    return NextResponse.json({ ok: false, error: "action_must_be_grant_or_revoke" }, { status: 400 });
  }

  const externalRef = String(body.external_ref || randomRef("operator_grant")).slice(0, 200);
  const balance = await grantCredits(
    userId,
    amount,
    externalRef,
    {
      note,
      actor: auth.actor || "operator",
      owner_id: auth.owner?.id || null,
      product: "rate_my_face_stripe_ledger",
      source: "operator_founder_grant"
    },
    { reason: "operator_grant", countAsPurchased: false }
  );

  const overview = await creditAccountOverview(userId);
  return NextResponse.json({
    ok: true,
    actor: auth.actor,
    action: "grant",
    amount,
    balance,
    external_ref: externalRef,
    product_credits_label: overview.label,
    note: "Founder grant via grantCredits into rmf_credit_ledger. Not Vercel Hobby / AI Gateway.",
    account: overview
  });
}
