import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";
import {
  billingAccount,
  getEntitlements,
  premiumPriceId,
  saveStripeCustomer,
  stripe,
  stripeConfigured
} from "../../../../lib/stripeBilling";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  }
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });
  }

  const entitlements = await getEntitlements(user.id);
  if (entitlements.premium) {
    return NextResponse.json(
      {
        ok: false,
        error: "already_premium",
        message: "This Rate My Face account already has premium access.",
        portal_action: "createBillingPortalSession"
      },
      { status: 409 }
    );
  }

  const client = stripe();
  const existing = await billingAccount(user.id);
  let customerId = existing?.stripe_customer_id ? String(existing.stripe_customer_id) : "";

  if (!customerId) {
    const customer = await client.customers.create({
      metadata: { rmf_user_id: user.id }
    });
    customerId = customer.id;
    await saveStripeCustomer(user.id, customerId);
  }

  const origin = request.nextUrl.origin;
  const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}/dashboard?checkout=cancelled`;

  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: premiumPriceId(), quantity: 1 }],
    metadata: { rmf_user_id: user.id, plan: "premium" },
    subscription_data: {
      metadata: { rmf_user_id: user.id, plan: "premium" }
    },
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  if (!session.url) {
    return NextResponse.json({ ok: false, error: "checkout_url_unavailable" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    checkout_url: session.url,
    session_id: session.id,
    plan: "premium"
  });
}
