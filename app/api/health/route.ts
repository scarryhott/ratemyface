import { NextResponse } from "next/server";
import { APPEARANCE_AGENT } from "../../../lib/appearanceAgent";
import { COMPARE_ME_TO_ME, COMPARE_TEST_ACTION_COST } from "../../../lib/compareFeature";
import { databaseConfigured } from "../../../lib/db";
import { SOCIAL_PROVIDER_OAUTH } from "../../../lib/providerConnections";
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
      metered_memory_cost: 1,
      compare_authenticated_test_cost: COMPARE_TEST_ACTION_COST
    },
    compare_me_to_me: {
      // FEATURE REMAINS DISABLED — schema may exist; do not flip LIVE.
      // Authenticated /api/compare/test is internal TESTING only (not OpenAPI).
      enabled: COMPARE_ME_TO_ME.enabled,
      status: COMPARE_ME_TO_ME.status,
      note: COMPARE_ME_TO_ME.note,
      tables: [...COMPARE_ME_TO_ME.tables],
      authenticated_test_path: COMPARE_ME_TO_ME.authenticated_test_path,
      public_api: "503 compare_disabled"
    },
    appearance_agent: {
      // FEATURE REMAINS DISABLED — not LIVE paid coaching; schema may exist.
      enabled: APPEARANCE_AGENT.enabled,
      status: APPEARANCE_AGENT.status,
      note: APPEARANCE_AGENT.note,
      tables: [...APPEARANCE_AGENT.tables],
      target_days: APPEARANCE_AGENT.target_days,
      depends_on: [...APPEARANCE_AGENT.depends_on]
    },
    social_providers: {
      // NO LIVE OAUTH until secrets configured — skeleton / stubs only.
      enabled: SOCIAL_PROVIDER_OAUTH.enabled,
      status: SOCIAL_PROVIDER_OAUTH.status,
      note: SOCIAL_PROVIDER_OAUTH.note,
      providers: [...SOCIAL_PROVIDER_OAUTH.providers],
      auth_mode: SOCIAL_PROVIDER_OAUTH.auth_mode,
      scraping: SOCIAL_PROVIDER_OAUTH.scraping,
      table: SOCIAL_PROVIDER_OAUTH.table
    },
    account_learning: {
      openapi_version: "2.5.3",
      profile_empty_shape: "found=false + preferences={}",
      retrieve_action: "getPersonalNetwork",
      pipeline: "rmf_interactions → rmf_personal_recommendations",
      compare_test_link: "opt-in RMF_COMPARE_TEST_LINK=1 queued linker only; /api/compare stays 503",
      compare_authenticated_test: "POST /api/compare/test (OAuth/operator, 1 credit); not an OpenAPI Action"
    },
    partner_tag: "ratemyfacegpt-20"
  });
}
