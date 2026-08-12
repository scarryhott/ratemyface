import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";
import {
  adjustProductCredits,
  creditAccountOverview,
  signupCredits
} from "../../../../lib/stripeBilling";

export const runtime = "nodejs";

function randomRef(): string {
  return `operator_adjust:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
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
    note: "These are Rate My Face product credits (Stripe ledger), not Vercel Hobby or AI Gateway balances.",
    account: overview
  });
}

export async function POST(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const userId = String(body.user_id || "").trim();
  const delta = Number(body.delta ?? body.amount);
  const note = String(body.note || "").slice(0, 500);
  const externalRef = String(body.external_ref || randomRef()).slice(0, 200);

  if (!userId) return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  if (!Number.isInteger(delta) || delta === 0) {
    return NextResponse.json({ ok: false, error: "integer_delta_required" }, { status: 400 });
  }
  if (Math.abs(delta) > 100_000) {
    return NextResponse.json({ ok: false, error: "delta_too_large" }, { status: 400 });
  }

  const result = await adjustProductCredits(userId, delta, externalRef, {
    note,
    actor: auth.actor || "operator",
    owner_id: auth.owner?.id || null,
    product: "rate_my_face_stripe_ledger"
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error || "adjust_failed",
        balance: result.balance,
        product_credits_label: "Rate My Face product credits (Stripe ledger)"
      },
      { status: result.error === "insufficient_balance" ? 409 : 400 }
    );
  }

  const overview = await creditAccountOverview(userId);
  return NextResponse.json({
    ok: true,
    actor: auth.actor,
    delta,
    external_ref: externalRef,
    product_credits_label: overview.label,
    note: "Granted/adjusted Rate My Face product credits (Stripe ledger). Not Vercel Hobby / AI Gateway.",
    account: overview
  });
}
