import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";
import { entitlementsCheckoutFields } from "../../../../lib/entitlementsCheckout";
import {
  MEMORY_CONTEXT_COST,
  creditsPerPack,
  ensureSignupCreditGrant,
  getEntitlements,
  signupCredits,
  stripeCreditsPriceConfigured,
  stripePriceConfigured,
  stripeSecretConfigured,
  stripeWebhookConfigured
} from "../../../../lib/stripeBilling";
import { PERSONAL_ACTION_COST, REPORT_ACTION_COST } from "../../../../lib/personalNetwork";
import { PERSONAL_EXPERIMENT_ACTION_COST } from "../../../../lib/personalExperimentEvidence";

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
    compare_me_to_me: PERSONAL_ACTION_COST,
    appearance_agent: PERSONAL_ACTION_COST,
    personal_experiments: PERSONAL_EXPERIMENT_ACTION_COST,
    report: REPORT_ACTION_COST
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
