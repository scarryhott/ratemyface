import { NextResponse } from "next/server";
import { COMPARE_ME_TO_ME } from "../../../lib/compareFeature";
import { databaseConfigured } from "../../../lib/db";
import {
  stripeCreditsPriceConfigured,
  stripePriceConfigured,
  stripeSecretConfigured,
  stripeWebhookConfigured
} from "../../../lib/stripeBilling";

export async function GET() {
  const amazonConfigured = Boolean(
    process.env.AMAZON_CREATORS_CLIENT_ID && process.env.AMAZON_CREATORS_CLIENT_SECRET
  );
  const actionAuthConfigured = Boolean(process.env.GPT_ACTION_SECRET);

  return NextResponse.json({
    ok: true,
    service: "ratemyface",
    amazon_configured: amazonConfigured,
    action_auth_configured: actionAuthConfigured,
    database_configured: databaseConfigured(),
    stripe_secret_configured: stripeSecretConfigured(),
    stripe_credit_price_configured: stripeCreditsPriceConfigured(),
    stripe_subscription_price_configured: stripePriceConfigured(),
    stripe_webhook_configured: stripeWebhookConfigured(),
    credit_model: {
      enabled_in_code: true,
      credits_per_pack: 100,
      metered_memory_cost: 1
    },
    compare_me_to_me: {
      // FEATURE REMAINS DISABLED — schema may exist; do not flip LIVE.
      enabled: COMPARE_ME_TO_ME.enabled,
      status: COMPARE_ME_TO_ME.status,
      note: COMPARE_ME_TO_ME.note,
      tables: [...COMPARE_ME_TO_ME.tables]
    },
    account_learning: {
      openapi_version: "2.5.3",
      profile_empty_shape: "found=false + preferences={}",
      retrieve_action: "getPersonalNetwork"
    },
    partner_tag: "ratemyfacegpt-20"
  });
}
