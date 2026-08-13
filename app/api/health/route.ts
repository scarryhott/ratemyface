import { NextResponse } from "next/server";
import { APPEARANCE_ACTION_COST, APPEARANCE_AGENT } from "../../../lib/appearanceAgent";
import { COMPARE_ACTION_COST, COMPARE_ME_TO_ME, COMPARE_TEST_ACTION_COST } from "../../../lib/compareFeature";
import { databaseConfigured } from "../../../lib/db";
import {
  PERSONAL_EXPERIMENT_ACTION_COST,
  PERSONAL_EXPERIMENTS
} from "../../../lib/personalExperimentEvidence";
import {
  PERSONAL_INTELLIGENCE,
  PERSONAL_INTELLIGENCE_ACTION_COST,
  PRODUCT_OUTCOME_MINIMUM,
  REFERENCE_MINIMUM_PAIRS,
  SOCIAL_MINIMUM_OBSERVATIONS
} from "../../../lib/personalIntelligenceEvidence";
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
      appearance_agent_cost: APPEARANCE_ACTION_COST,
      personal_experiment_cost: PERSONAL_EXPERIMENT_ACTION_COST,
      personal_intelligence_cost: PERSONAL_INTELLIGENCE_ACTION_COST
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
    personal_experiments: {
      // Paid evidence Actions. A closed run may still be insufficient or tied.
      enabled: PERSONAL_EXPERIMENTS.enabled,
      status: PERSONAL_EXPERIMENTS.status,
      note: PERSONAL_EXPERIMENTS.note,
      tables: [...PERSONAL_EXPERIMENTS.tables],
      action_path: PERSONAL_EXPERIMENTS.action_path,
      evidence_states: ["insufficient", "tied", "favors_a", "favors_b"],
      causal_claim: false,
      medical_claim: false,
      public_unauthenticated: "401 oauth_required"
    },
    personal_intelligence: {
      // Paid evidence Actions. MCP expansion is read-only and server-scoped.
      enabled: PERSONAL_INTELLIGENCE.enabled,
      status: PERSONAL_INTELLIGENCE.status,
      note: PERSONAL_INTELLIGENCE.note,
      tables: [...PERSONAL_INTELLIGENCE.tables],
      action_paths: PERSONAL_INTELLIGENCE.action_paths,
      evidence_states: {
        history: ["insufficient", "answered"],
        products: ["insufficient", "tied", "favors_product", "no_product_favored"],
        social: ["insufficient", "tied", "improved", "declined"],
        references: ["insufficient", "tied", "self_higher", "reference_higher"]
      },
      minimum_evidence: {
        product_outcomes_per_product: PRODUCT_OUTCOME_MINIMUM,
        social_observations_per_relation: SOCIAL_MINIMUM_OBSERVATIONS,
        reference_pairs: REFERENCE_MINIMUM_PAIRS
      },
      mcp: {
        path: PERSONAL_INTELLIGENCE.action_paths.mcp,
        user_scope_configured: Boolean(
          process.env.RMF_CHATGPT_MCP_TOKEN && process.env.RMF_CHATGPT_MCP_USER_ID
        ),
        mutation_tools: false
      },
      personal_agent: {
        autonomous_reads: true,
        unapproved_writes: false,
        external_actions: false,
        completion_requires_verified_receipt: true
      },
      scraping: false,
      causal_claim: false,
      medical_claim: false,
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
      openapi_version: "3.0.0",
      profile_empty_shape: "found=false + preferences={}",
      retrieve_action: "getPersonalNetwork",
      pipeline: "rmf_interactions → rmf_personal_recommendations",
      compare_test_link: "opt-in RMF_COMPARE_TEST_LINK=1 queued linker only; not anonymous compare",
      compare_authenticated_test: "POST /api/compare/test (OAuth/operator, 1 credit); internal history placeholder",
      compare_action: "POST /api/compare compareMeToMe (OAuth + 1 credit + consent_compare + image refs)",
      appearance_action: "POST /api/appearance appearancePlan + POST /api/appearance/plans appearanceCheckin (OAuth + 1 credit + consent_appearance + required history)",
      personal_experiment_actions: "GET /api/experiments getPersonalExperiments + POST /api/experiments updatePersonalExperiment (OAuth + 1 credit + consent_experiment for writes)",
      personal_intelligence_actions: "Ask My History + product/social outcomes + references + bounded agent Actions (OAuth + 1 credit; consent on writes; explicit evidence closure)",
      personal_network_mcp: "read-only single-user scope via RMF_CHATGPT_MCP_USER_ID; OAuth Actions remain the only personal write surface"
    },
    partner_tag: "ratemyfacegpt-20"
  });
}
