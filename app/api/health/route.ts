import { NextResponse } from "next/server";
import { APPEARANCE_ACTION_COST, APPEARANCE_AGENT } from "../../../lib/appearanceAgent";
import { COMPARE_ACTION_COST, COMPARE_ME_TO_ME, COMPARE_TEST_ACTION_COST } from "../../../lib/compareFeature";
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
      compare_authenticated_test_cost: COMPARE_TEST_ACTION_COST,
      compare_me_to_me_cost: COMPARE_ACTION_COST,
      appearance_agent_cost: APPEARANCE_ACTION_COST
    },
    compare_me_to_me: {
      // Paid OpenAPI Action. Unauthenticated compare is not free. Not a LIVE vision claim.
      enabled: COMPARE_ME_TO_ME.enabled,
      status: COMPARE_ME_TO_ME.status,
      vision_status: COMPARE_ME_TO_ME.vision_status,
      note: COMPARE_ME_TO_ME.note,
      tables: [...COMPARE_ME_TO_ME.tables],
      action_path: COMPARE_ME_TO_ME.action_path,
      authenticated_test_path: COMPARE_ME_TO_ME.authenticated_test_path,
      public_unauthenticated: "401 oauth_required"
    },
    appearance_agent: {
      // Paid OpenAPI Actions. Unauthenticated appearance is not free. Not a LIVE coaching claim.
      enabled: APPEARANCE_AGENT.enabled,
      status: APPEARANCE_AGENT.status,
      note: APPEARANCE_AGENT.note,
      tables: [...APPEARANCE_AGENT.tables],
      target_days: APPEARANCE_AGENT.target_days,
      depends_on: [...APPEARANCE_AGENT.depends_on],
      action_path: APPEARANCE_AGENT.action_path,
      checkin_path: APPEARANCE_AGENT.checkin_path,
      public_unauthenticated: "401 oauth_required"
    },
    social_providers: {
      // enabled only when at least one provider's secrets exist. Never scrape.
      enabled: SOCIAL_PROVIDER_OAUTH.enabled,
      status: SOCIAL_PROVIDER_OAUTH.status,
      note: SOCIAL_PROVIDER_OAUTH.note,
      providers: [...SOCIAL_PROVIDER_OAUTH.providers],
      configured_providers: SOCIAL_PROVIDER_OAUTH.configured_providers,
      auth_mode: SOCIAL_PROVIDER_OAUTH.auth_mode,
      scraping: SOCIAL_PROVIDER_OAUTH.scraping,
      table: SOCIAL_PROVIDER_OAUTH.table
    },
    account_learning: {
      openapi_version: "2.5.6",
      profile_empty_shape: "found=false + preferences={}",
      retrieve_action: "getPersonalNetwork",
      pipeline: "rmf_interactions → rmf_personal_recommendations",
      compare_test_link: "opt-in RMF_COMPARE_TEST_LINK=1 queued linker only; not anonymous compare",
      compare_authenticated_test: "POST /api/compare/test (OAuth/operator, 1 credit); internal history placeholder",
      compare_action: "POST /api/compare compareMeToMe (OAuth + 1 credit + consent_compare + image refs)",
      appearance_action: "POST /api/appearance appearancePlan + POST /api/appearance/plans appearanceCheckin (OAuth + 1 credit + consent_appearance + required history)"
    },
    partner_tag: "ratemyfacegpt-20"
  });
}
