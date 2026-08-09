import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";
import { billingAccount, stripe, stripeSecretConfigured } from "../../../../lib/stripeBilling";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  }
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }
  if (!stripeSecretConfigured()) {
    return NextResponse.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });
  }

  const account = await billingAccount(user.id);
  const customerId = account?.stripe_customer_id ? String(account.stripe_customer_id) : "";
  if (!customerId) {
    return NextResponse.json({ ok: false, error: "billing_account_not_found" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: process.env.STRIPE_PORTAL_RETURN_URL || `${origin}/dashboard`
  });

  return NextResponse.json({ ok: true, portal_url: session.url });
}
