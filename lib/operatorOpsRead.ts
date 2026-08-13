import { databaseConfigured, db } from "./db";
import {
  MEMORY_CONTEXT_COST,
  creditsPerPack,
  signupCredits,
  stripeCreditsPriceConfigured,
  stripePriceConfigured,
  stripeSecretConfigured,
  stripeWebhookConfigured
} from "./stripeBilling";
import { COMPARE_TEST_ACTION_COST } from "./compareFeature";
import { PERSONAL_ACTION_COST, REPORT_ACTION_COST } from "./personalNetwork";

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function tableExists(tx: any, name: string): Promise<boolean> {
  const rows = await tx`
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = ${name}
    limit 1
  `;
  return rows.length > 0;
}

async function readBillingOverview(tx: any) {
  const creditModel = {
    credits_per_pack: creditsPerPack(),
    metered_personal_cost: PERSONAL_ACTION_COST,
    metered_memory_cost: MEMORY_CONTEXT_COST,
    report_cost: REPORT_ACTION_COST,
    compare_authenticated_test_cost: COMPARE_TEST_ACTION_COST,
    signup_credits: signupCredits(),
    label: productCreditLabel()
  };
  const stripe = {
    secret_configured: stripeSecretConfigured(),
    credit_price_configured: stripeCreditsPriceConfigured(),
    subscription_price_configured: stripePriceConfigured(),
    webhook_configured: stripeWebhookConfigured()
  };

  const empty = {
    credit_model: creditModel,
    stripe,
    accounts_with_balance: 0,
    total_credit_balance: 0,
    lifetime_purchased: 0,
    lifetime_spent: 0,
    premium_entitlements_active: 0,
    billing_accounts: 0,
    personal_profiles: 0,
    memory_contexts: 0,
    usage_by_action_30d: [] as Array<{ action: string; events: number; credits_spent: number }>,
    recent_credit_ledger: [] as Array<{
      id: number;
      user_id: string;
      delta: number;
      balance_after: number;
      reason: string;
      action: string | null;
      created_at: string;
    }>,
    revenue_mapping:
      "PRODUCT credits only: paid persistence consumes Stripe-metered Rate My Face credits (personal/memory=1, report=5, compare authenticated test=1); founder grantCredits on /operator/dashboard; optional signup_grant (RMF_SIGNUP_CREDITS, default 100); packs via createCreditCheckoutSession → webhook → same rmf_credit_ledger. Not Vercel Hobby quotas and not Vercel AI Gateway USD. Premium UI stays disabled until STRIPE_PRICE_ID_PREMIUM is configured."
  };

  const hasCredits = await tableExists(tx, "rmf_credit_accounts");
  const hasLedger = await tableExists(tx, "rmf_credit_ledger");
  const hasEntitlements = await tableExists(tx, "rmf_entitlements");
  const hasBilling = await tableExists(tx, "rmf_billing_accounts");
  const hasProfiles = await tableExists(tx, "rmf_personal_profiles");
  const hasMemory = await tableExists(tx, "rmf_user_context");

  if (!hasCredits && !hasLedger && !hasEntitlements) {
    return {
      ...empty,
      revenue_mapping: stripe.subscription_price_configured
        ? "Credit ledger tables not created yet. Premium subscription price is configured in env."
        : empty.revenue_mapping
    };
  }

  let accounts_with_balance = 0;
  let total_credit_balance = 0;
  let lifetime_purchased = 0;
  let lifetime_spent = 0;
  if (hasCredits) {
    const creditStats = await tx`
      select
        count(*) filter (where balance > 0)::int as accounts_with_balance,
        coalesce(sum(balance), 0)::bigint as total_credit_balance,
        coalesce(sum(lifetime_purchased), 0)::bigint as lifetime_purchased,
        coalesce(sum(lifetime_spent), 0)::bigint as lifetime_spent
      from rmf_credit_accounts
    `;
    accounts_with_balance = asNumber(creditStats[0]?.accounts_with_balance);
    total_credit_balance = asNumber(creditStats[0]?.total_credit_balance);
    lifetime_purchased = asNumber(creditStats[0]?.lifetime_purchased);
    lifetime_spent = asNumber(creditStats[0]?.lifetime_spent);
  }

  let premium_entitlements_active = 0;
  if (hasEntitlements) {
    const premium = await tx`
      select count(*)::int as total
      from rmf_entitlements
      where feature = 'premium'
        and active = true
        and (expires_at is null or expires_at > now())
    `;
    premium_entitlements_active = asNumber(premium[0]?.total);
  }

  let billing_accounts = 0;
  if (hasBilling) {
    const billing = await tx`select count(*)::int as total from rmf_billing_accounts`;
    billing_accounts = asNumber(billing[0]?.total);
  }

  let personal_profiles = 0;
  if (hasProfiles) {
    const profiles = await tx`select count(*)::int as total from rmf_personal_profiles`;
    personal_profiles = asNumber(profiles[0]?.total);
  }

  let memory_contexts = 0;
  if (hasMemory) {
    const memory = await tx`select count(*)::int as total from rmf_user_context`;
    memory_contexts = asNumber(memory[0]?.total);
  }

  let usage_by_action_30d: Array<{ action: string; events: number; credits_spent: number }> = [];
  let recent_credit_ledger: Array<{
    id: number;
    user_id: string;
    delta: number;
    balance_after: number;
    reason: string;
    action: string | null;
    created_at: string;
  }> = [];

  if (hasLedger) {
    const usage = await tx`
      select
        coalesce(nullif(action, ''), reason) as action,
        count(*)::int as events,
        coalesce(sum(case when delta < 0 then -delta else 0 end), 0)::bigint as credits_spent
      from rmf_credit_ledger
      where created_at >= now() - interval '30 days'
      group by 1
      order by credits_spent desc, events desc
      limit 12
    `;
    usage_by_action_30d = usage.map((r: any) => ({
      action: String(r.action || "unknown"),
      events: asNumber(r.events),
      credits_spent: asNumber(r.credits_spent)
    }));

    const recent = await tx`
      select id, user_id, delta, balance_after, reason, action, created_at
      from rmf_credit_ledger
      order by created_at desc
      limit 12
    `;
    recent_credit_ledger = recent.map((r: any) => ({
      id: Number(r.id),
      user_id: String(r.user_id).slice(0, 12) + (String(r.user_id).length > 12 ? "…" : ""),
      delta: asNumber(r.delta),
      balance_after: asNumber(r.balance_after),
      reason: String(r.reason),
      action: r.action == null ? null : String(r.action),
      created_at: String(r.created_at)
    }));
  }

  const premiumNote = stripe.subscription_price_configured
    ? "Premium subscription price is configured; active premium rows come from verified Stripe subscription webhooks only."
    : "Premium subscription checkout is not configured (STRIPE_PRICE_ID_PREMIUM unset) — do not treat free users as premium.";

  return {
    credit_model: creditModel,
    stripe,
    accounts_with_balance,
    total_credit_balance,
    lifetime_purchased,
    lifetime_spent,
    premium_entitlements_active,
    billing_accounts,
    personal_profiles,
    memory_contexts,
    usage_by_action_30d,
    recent_credit_ledger,
    revenue_mapping: `PRODUCT ${productCreditLabel()}: persistence Actions consume ${PERSONAL_ACTION_COST} credit (report=${REPORT_ACTION_COST}); founder grantCredits on dashboard; optional signup_grant=${signupCredits()}; packs=${creditsPerPack()} via createCreditCheckoutSession → Stripe webhook → same rmf_credit_ledger. Not Vercel Hobby / AI Gateway. ${premiumNote}`
  };
}

function productCreditLabel() {
  return "Rate My Face product credits (Stripe ledger)";
}

/** Vercel hosting / AI Gateway are infrastructure — never product business credits. */
export function infrastructureCreditBoundary() {
  return {
    vercel_hosting: {
      plan: "Hobby",
      status: "Active",
      payment_methods: "none",
      note: "Vercel team hosting plan only. Not Rate My Face product credits. Operator reference from live Vercel check; not live-polled by this API."
    },
    vercel_ai_gateway: {
      balance_usd: 0,
      auto_reload: false,
      note: "Vercel AI Gateway USD balance is infrastructure spend for model calls. Do NOT treat as Rate My Face product credits, packs, entitlements, or checkout."
    },
    product_credits: {
      system: "stripe_metered",
      label: productCreditLabel(),
      credits_per_pack: creditsPerPack(),
      signup_credits: signupCredits(),
      metered_memory_cost: MEMORY_CONTEXT_COST,
      metered_personal_cost: PERSONAL_ACTION_COST,
      report_cost: REPORT_ACTION_COST,
      checkout_action: "createCreditCheckoutSession",
      entitlements: "free vs premium (premium only when STRIPE_PRICE_ID_PREMIUM + verified webhook)",
      note: "Sole product business credit system: grantCredits / consumeCredits on rmf_credit_* . Founder grants + optional signup_grant + Stripe packs."
    },
    nodejs_runtime_note:
      "Vercel sidebar may show Node.js 20 warnings on projects — optional infra note only; unrelated to product credit packs."
  };
}

function billingFromEnvOnly() {
  return {
    credit_model: {
      credits_per_pack: creditsPerPack(),
      metered_personal_cost: PERSONAL_ACTION_COST,
      metered_memory_cost: MEMORY_CONTEXT_COST,
      report_cost: REPORT_ACTION_COST,
      signup_credits: signupCredits(),
      label: productCreditLabel()
    },
    stripe: {
      secret_configured: stripeSecretConfigured(),
      credit_price_configured: stripeCreditsPriceConfigured(),
      subscription_price_configured: stripePriceConfigured(),
      webhook_configured: stripeWebhookConfigured()
    },
    accounts_with_balance: 0,
    total_credit_balance: 0,
    lifetime_purchased: 0,
    lifetime_spent: 0,
    premium_entitlements_active: 0,
    billing_accounts: 0,
    personal_profiles: 0,
    memory_contexts: 0,
    usage_by_action_30d: [] as Array<{ action: string; events: number; credits_spent: number }>,
    recent_credit_ledger: [] as Array<{
      id: number;
      user_id: string;
      delta: number;
      balance_after: number;
      reason: string;
      action: string | null;
      created_at: string;
    }>,
    revenue_mapping:
      "Database not configured; showing Stripe/env Rate My Face product credit model only. Separate from Vercel Hobby and AI Gateway USD."
  };
}

export async function getOperatorOpsRead() {
  if (!databaseConfigured()) {
    const billing = billingFromEnvOnly();
    return {
      ok: true,
      database_configured: false,
      generated_at: new Date().toISOString(),
      counts: { projects: 0, runs: 0, signals: 0, ledger: 0, gpts: 0, receipts: 0, approvals_pending: 0, approvals_total: 0 },
      accounts: { auth_users: 0, oauth_users: 0, active_oauth_tokens: 0 },
      portfolio: { active_gpts: 0, draft_gpts: 0, public_gpts: 0, action_gpts: 0, amazon_linked_gpts: 0 },
      commerce: { amazon: null },
      billing,
      infrastructure: infrastructureCreditBoundary(),
      projects: [],
      recent_runs: [],
      recent_signals: [],
      recent_ledger: [],
      gpts: [],
      recent_receipts: [],
      recent_approvals: [],
      external_metrics: {
        amazon_associates: { status: "snapshot_unavailable", note: "No stored Amazon Associates snapshot is available." },
        vercel_hosting: {
          status: "hobby_active",
          note: infrastructureCreditBoundary().vercel_hosting.note
        },
        vercel_ai_gateway: {
          status: "not_product_credits",
          note: infrastructureCreditBoundary().vercel_ai_gateway.note
        },
        vercel_analytics: { status: "connect_later", note: "Live Vercel analytics are not persisted in Postgres yet." },
        railway_browser: {
          status: process.env.RMF_BROWSER_CONTROL_URL ? "configured" : "connect_later",
          note: process.env.RMF_BROWSER_CONTROL_URL
            ? "Browser control URL is configured; live Railway metrics are not ingested into Postgres yet."
            : "Railway browser control is not configured."
        },
        stripe_product_credits: {
          status: billing.stripe.secret_configured && billing.stripe.credit_price_configured && billing.stripe.webhook_configured ? "configured" : "partial",
          note: billing.revenue_mapping
        }
      }
    };
  }

  const sql = db();
  return await sql.begin(async (tx) => {
    await tx`set local statement_timeout = '3000ms'`;
    await tx`set local lock_timeout = '1500ms'`;

    const projectCount = await tx`select count(*)::int as total from rmf_agent_projects`;
    const runCount = await tx`select count(*)::int as total from rmf_agent_runs`;
    const signalCount = await tx`select count(*)::int as total from rmf_agent_signals`;
    const ledgerCount = await tx`select count(*)::int as total from rmf_agent_ledger`;
    const gptCount = await tx`select count(*)::int as total from rmf_agent_gpts`;
    const receiptCount = await tx`select count(*)::int as total from rmf_agent_receipts`;
    const pendingApprovalCount = await tx`select count(*)::int as total from rmf_agent_approvals where status='pending'`;
    const approvalCount = await tx`select count(*)::int as total from rmf_agent_approvals`;

    const authUsers = await tx`select count(*)::int as total from auth.users`;
    const oauthStats = await tx`
      select
        count(distinct user_id)::int as users,
        count(*) filter (where revoked_at is null and expires_at > now())::int as active_tokens
      from rmf_oauth_tokens
    `;
    const portfolioStats = await tx`
      select
        count(*) filter (where status='active')::int as active_gpts,
        count(*) filter (where status='draft')::int as draft_gpts,
        count(*) filter (where config->>'visibility'='public')::int as public_gpts,
        count(*) filter (where coalesce((config->>'actions')::boolean,false))::int as action_gpts,
        count(*) filter (where coalesce((config->>'amazon_links')::boolean,false))::int as amazon_linked_gpts
      from rmf_agent_gpts
    `;
    const amazonSnapshot = await tx`
      select value, updated_at
      from rmf_agent_context
      where key='amazon_associates:ratemyface0a-20:last_30_days'
      limit 1
    `;

    const projects = await tx`select id, slug, name, repository, vercel_project_id, status, updated_at from rmf_agent_projects order by id limit 50`;
    const recentRuns = await tx`select id, signal_id, model, authority, status, harness, closure_state, error, created_at, completed_at from rmf_agent_runs order by created_at desc limit 15`;
    const recentSignals = await tx`select id, source, kind, status, requested_authority, created_at, started_at, completed_at from rmf_agent_signals order by created_at desc limit 15`;
    const recentLedger = await tx`select id, run_id, event, capability, authority, admissible, created_at from rmf_agent_ledger order by created_at desc limit 20`;
    const gpts = await tx`select id, project_id, gpt_key, name, platform, status, external_id, config, updated_at from rmf_agent_gpts order by id limit 50`;
    const recentReceipts = await tx`select id, run_id, tool, authority, verified, external_ref, created_at from rmf_agent_receipts order by created_at desc limit 15`;
    const recentApprovals = await tx`select id, run_id, capability, requested_authority, status, rationale, created_at, decided_at from rmf_agent_approvals order by created_at desc limit 15`;

    const amazon = amazonSnapshot[0]
      ? { ...(amazonSnapshot[0].value as Record<string, unknown>), snapshot_updated_at: String(amazonSnapshot[0].updated_at) }
      : null;

    const billing = await readBillingOverview(tx);

    return {
      ok: true,
      database_configured: true,
      generated_at: new Date().toISOString(),
      counts: {
        projects: asNumber(projectCount[0]?.total),
        runs: asNumber(runCount[0]?.total),
        signals: asNumber(signalCount[0]?.total),
        ledger: asNumber(ledgerCount[0]?.total),
        gpts: asNumber(gptCount[0]?.total),
        receipts: asNumber(receiptCount[0]?.total),
        approvals_pending: asNumber(pendingApprovalCount[0]?.total),
        approvals_total: asNumber(approvalCount[0]?.total)
      },
      accounts: {
        auth_users: asNumber(authUsers[0]?.total),
        oauth_users: asNumber(oauthStats[0]?.users),
        active_oauth_tokens: asNumber(oauthStats[0]?.active_tokens)
      },
      portfolio: {
        active_gpts: asNumber(portfolioStats[0]?.active_gpts),
        draft_gpts: asNumber(portfolioStats[0]?.draft_gpts),
        public_gpts: asNumber(portfolioStats[0]?.public_gpts),
        action_gpts: asNumber(portfolioStats[0]?.action_gpts),
        amazon_linked_gpts: asNumber(portfolioStats[0]?.amazon_linked_gpts)
      },
      commerce: { amazon },
      billing,
      infrastructure: infrastructureCreditBoundary(),
      projects: projects.map((r: any) => ({ ...r, id: Number(r.id), updated_at: String(r.updated_at) })),
      recent_runs: recentRuns.map((r: any) => ({
        ...r,
        id: Number(r.id),
        signal_id: r.signal_id == null ? null : Number(r.signal_id),
        authority: Number(r.authority),
        error: r.error == null ? null : String(r.error).slice(0, 240),
        created_at: String(r.created_at),
        completed_at: r.completed_at == null ? null : String(r.completed_at)
      })),
      recent_signals: recentSignals.map((r: any) => ({
        ...r,
        id: Number(r.id),
        requested_authority: Number(r.requested_authority),
        created_at: String(r.created_at),
        started_at: r.started_at == null ? null : String(r.started_at),
        completed_at: r.completed_at == null ? null : String(r.completed_at)
      })),
      recent_ledger: recentLedger.map((r: any) => ({
        ...r,
        id: Number(r.id),
        run_id: r.run_id == null ? null : Number(r.run_id),
        authority: Number(r.authority),
        admissible: Boolean(r.admissible),
        created_at: String(r.created_at)
      })),
      gpts: gpts.map((r: any) => ({
        ...r,
        id: Number(r.id),
        project_id: r.project_id == null ? null : Number(r.project_id),
        config: r.config || {},
        updated_at: String(r.updated_at)
      })),
      recent_receipts: recentReceipts.map((r: any) => ({
        ...r,
        id: Number(r.id),
        run_id: Number(r.run_id),
        authority: Number(r.authority),
        verified: Boolean(r.verified),
        created_at: String(r.created_at)
      })),
      recent_approvals: recentApprovals.map((r: any) => ({
        ...r,
        id: Number(r.id),
        run_id: r.run_id == null ? null : Number(r.run_id),
        requested_authority: Number(r.requested_authority),
        created_at: String(r.created_at),
        decided_at: r.decided_at == null ? null : String(r.decided_at)
      })),
      external_metrics: {
        amazon_associates: amazon
          ? { status: "snapshot", note: `Stored Amazon Associates snapshot through ${String((amazon as any).period_end || "unknown date")}.` }
          : { status: "snapshot_unavailable", note: "No stored Amazon Associates snapshot is available." },
        vercel_hosting: {
          status: "hobby_active",
          note: infrastructureCreditBoundary().vercel_hosting.note
        },
        vercel_ai_gateway: {
          status: "not_product_credits",
          note: infrastructureCreditBoundary().vercel_ai_gateway.note
        },
        vercel_analytics: { status: "connect_later", note: "Live Vercel analytics are not persisted in Postgres yet." },
        railway_browser: {
          status: process.env.RMF_BROWSER_CONTROL_URL ? "configured" : "connect_later",
          note: process.env.RMF_BROWSER_CONTROL_URL
            ? "Browser control URL is configured; live Railway metrics are not ingested into Postgres yet."
            : "Railway browser control is not configured."
        },
        stripe_product_credits: {
          status:
            billing.stripe.secret_configured &&
            billing.stripe.credit_price_configured &&
            billing.stripe.webhook_configured
              ? "configured"
              : "partial",
          note: billing.revenue_mapping
        }
      }
    };
  });
}
