import { NextRequest, NextResponse } from "next/server";
import { currentOAuthUser } from "../../../../../lib/supabaseAuth";
import {
  billingAccount,
  creditsPerPack,
  creditsPriceId,
  saveStripeCustomer,
  stripe,
  stripeCreditsPriceConfigured,
  stripeSecretConfigured
} from "../../../../../lib/stripeBilling";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  if (!stripeSecretConfigured() || !stripeCreditsPriceConfigured()) {
    return NextResponse.json({ ok: false, error: "credit_checkout_not_configured" }, { status: 503 });
  }

  const client = stripe();
  const existing = await billingAccount(user.id);
  let customerId = existing?.stripe_customer_id ? String(existing.stripe_customer_id) : "";

  if (!customerId) {
    const customer = await client.customers.create({ metadata: { rmf_user_id: user.id } });
    customerId = customer.id;
    await saveStripeCustomer(user.id, customerId);
  }

  const origin = request.nextUrl.origin;
  const credits = creditsPerPack();
  const checkoutSource = request.nextUrl.searchParams.get("source") === "web_account"
    ? "web_account"
    : "chatgpt_action";
  const webAccountCheckout = checkoutSource === "web_account";
  const session = await client.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: creditsPriceId(), quantity: 1 }],
    metadata: {
      rmf_user_id: user.id,
      purchase_type: "credits",
      credits: String(credits),
      checkout_source: checkoutSource
    },
    success_url: webAccountCheckout
      ? `${origin}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`
      : process.env.STRIPE_SUCCESS_URL || `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: webAccountCheckout
      ? `${origin}/account?checkout=cancelled`
      : process.env.STRIPE_CANCEL_URL || `${origin}/dashboard?checkout=cancelled`
  });

  if (!session.url) {
    return NextResponse.json({ ok: false, error: "checkout_url_unavailable" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    checkout_url: session.url,
    session_id: session.id,
    credits,
    checkout_source: checkoutSource
  });
}
