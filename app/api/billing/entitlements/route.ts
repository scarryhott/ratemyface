import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";
import {
  MEMORY_CONTEXT_COST,
  creditsPerPack,
  ensureSignupCreditGrant,
  entitlementsCheckoutFields,
  getEntitlements,
  signupCredits,
  stripeCreditsPriceConfigured,
  stripePriceConfigured,
  stripeSecretConfigured,
  stripeWebhookConfigured
} from "../../../../lib/stripeBilling";
import { COMPARE_TEST_ACTION_COST } from "../../../../lib/compareFeature";
import { PERSONAL_ACTION_COST, REPORT_ACTION_COST } from "../../../../lib/personalNetwork";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  }
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  await ensureSignupCreditGrant(user.id);
  const entitlements = await getEntitlements(user.id);
  const subscriptionAvailable = stripeSecretConfigured() && stripePriceConfigured();
  const creditCheckoutAvailable = stripeSecretConfigured() && stripeCreditsPriceConfigured() && stripeWebhookConfigured();
  const metered_costs = {
    personal_network: PERSONAL_ACTION_COST,
    memory_context: MEMORY_CONTEXT_COST,
    report: REPORT_ACTION_COST,
    compare_authenticated_test: COMPARE_TEST_ACTION_COST
  };

  return NextResponse.json({
    ok: true,
    plan: entitlements.premium ? "premium" : "free",
    ...entitlements,
    signup_bootstrap_credits: signupCredits(),
    metered_costs,
    credit_checkout_available: creditCheckoutAvailable,
    subscription_available: subscriptionAvailable,
    ...entitlementsCheckoutFields(entitlements.credits, creditsPerPack(), metered_costs),
    note: subscriptionAvailable
      ? "Credits meter paid persistence Actions via grantCredits/consumeCredits. Optional signup_grant is non-purchase. Premium subscription is also configured."
      : "Credits meter paid persistence Actions via grantCredits/consumeCredits. Optional signup_grant is non-purchase. Premium subscription checkout is not configured (STRIPE_PRICE_ID_PREMIUM unset)."
  });
}
