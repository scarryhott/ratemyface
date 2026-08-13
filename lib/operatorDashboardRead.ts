import { APPEARANCE_AGENT } from "./appearanceAgent";
import { COMPARE_ME_TO_ME } from "./compareFeature";
import { databaseConfigured, db } from "./db";
import { metric, unavailable, type MetricValue } from "./metricValue";
import {
  getOperatorOpsRead,
  existingPublicTables,
  infrastructureCreditBoundary,
  unavailableOperatorOpsRead
} from "./operatorOpsRead";
import { SOCIAL_PROVIDER_OAUTH } from "./providerConnections";
import {
  creditsPerPack,
  signupCredits
} from "./stripeBilling";

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function deploySha(): string | null {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    null
  );
}

export type DashboardV2 = {
  ok: boolean;
  version: "dashboard_v2";
  database_configured: boolean;
  counts_available?: boolean;
  ops_read_error?: string;
  generated_at: string;
  actor?: string;
  owner?: unknown;
  business_overview: {
    users: {
      total: MetricValue;
      active_7d: MetricValue;
      active_30d: MetricValue;
      new_signups_7d: MetricValue;
      new_signups_30d: MetricValue;
    };
    gpt_usage: {
      inventory: MetricValue;
      public_gpts: MetricValue;
      rate_my_face_chats: MetricValue;
      action_calls: MetricValue;
    };
    revenue: {
      amazon_clicks: MetricValue;
      amazon_revenue_usd: MetricValue;
      stripe_revenue_usd: MetricValue;
      credits_sold: MetricValue;
      credits_consumed: MetricValue;
    };
    learning: {
      profiles_created: MetricValue;
      interactions_stored: MetricValue;
      recommendations_stored: MetricValue;
      compare_jobs: MetricValue;
      social_connections: MetricValue;
    };
  };
  credit_economy: {
    product_label: string;
    vercel_note: string;
    founder_grants: MetricValue;
    founder_grant_credits: MetricValue;
    signup_grants: MetricValue;
    stripe_packs_sold: MetricValue;
    stripe_pack_credits: MetricValue;
    stripe_events: MetricValue;
    usage_consumed: MetricValue;
    remaining_balance: MetricValue;
    top_ops: Array<{ action: string; events: number; credits_spent: number }>;
    recent_ledger: Array<{
      id: number;
      user_id: string;
      delta: number;
      balance_after: number;
      reason: string;
      action: string | null;
      created_at: string;
    }>;
    tables: string[];
    actions: {
      grant_founder_credits: boolean;
      view_ledger: boolean;
      revoke_suspicious_grants: boolean;
      inspect_consumption: boolean;
      auto_mutate_without_audit: false;
    };
  };
  gpt_portfolio: {
    gpts: Array<{
      id: number;
      gpt_key: string;
      name: string;
      status: string;
      platform: string;
      visibility: string;
      actions: boolean;
      amazon_links: boolean;
      chats_reported: MetricValue;
      retention: MetricValue;
      revenue: MetricValue;
      amazon_tracking_id: string;
      updated_at: string;
    }>;
    summary: {
      active: number;
      draft: number;
      public: number;
      action_gpts: number;
      amazon_linked: number;
    };
    tables: string[];
  };
  learning_console: {
    users_with_profiles: MetricValue;
    observations: MetricValue;
    recommendations: MetricValue;
    interactions: MetricValue;
    learning_events: MetricValue;
    recent_profiles: Array<{
      user_id: string;
      updated_at: string;
      consent_personalization?: boolean | null;
    }>;
    tables: string[];
    admin_note: string;
  };
  compare_me_to_me: {
    status: "DISABLED" | "TESTING" | "LIVE" | "PAID";
    enabled: boolean;
    jobs_queued: MetricValue;
    jobs_running: MetricValue;
    jobs_completed: MetricValue;
    results: MetricValue;
    gate: string;
    /** Schema table names (may exist while vision stays limited). */
    future_tables: string[];
    schema_ready: boolean;
    vision_status?: string;
    action_path?: string;
  };
  appearance_agent: {
    status: "DISABLED" | "TESTING" | "LIVE" | "PAID";
    enabled: boolean;
    plans_total: MetricValue;
    plans_draft: MetricValue;
    plans_active: MetricValue;
    checkins: MetricValue;
    gate: string;
    future_tables: string[];
    schema_ready: boolean;
    note: string;
    target_days: number;
    depends_on: string[];
    action_path?: string;
  };
  social_providers: {
    status: "UNAVAILABLE" | "NOT_CONFIGURED" | "LIVE";
    enabled: boolean;
    oauth_ready: boolean;
    scraping: false;
    auth_mode: string;
    planned: string[];
    configured_providers: string[];
    connection_rows: MetricValue;
    connected: MetricValue;
    revoked: MetricValue;
    gate: string;
    table: string;
    schema_ready: boolean;
    note: string;
  };
  revenue_dashboard: {
    amazon_tag: string;
    amazon_attribution: string;
    amazon_clicks: MetricValue;
    amazon_ordered_items: MetricValue;
    amazon_earnings_usd: MetricValue;
    stripe_products: string;
    stripe_purchases: MetricValue;
    stripe_refunds: MetricValue;
    stripe_usage_events: MetricValue;
    stripe_events_processed: MetricValue;
    tables: string[];
    product_vs_infra: string;
  };
  operations_health: {
    vercel: { status: string; note: string };
    supabase: { status: string; note: string };
    railway: { status: string; note: string };
    github: { status: string; note: string };
    actions: { status: string; note: string };
    stripe: { status: string; note: string };
    latest_deploy_sha: string | null;
    recent_errors: Array<{ id: number; model: string | null; error: string | null; created_at: string }>;
    failed_actions: MetricValue;
    auth_failures: MetricValue;
    pending_approvals: number;
  };
  /** Full ops payload retained for founder grant panel + legacy compatibility. */
  ops: Awaited<ReturnType<typeof getOperatorOpsRead>>;
};

function emptyDashboard(
  ops: Awaited<ReturnType<typeof getOperatorOpsRead>>,
  reason = "Database not configured"
): DashboardV2 {
  const infra = infrastructureCreditBoundary();
  return {
    ok: true,
    version: "dashboard_v2",
    database_configured: false,
    counts_available: false,
    ops_read_error: reason,
    generated_at: new Date().toISOString(),
    business_overview: {
      users: {
        total: unavailable(reason),
        active_7d: unavailable(reason),
        active_30d: unavailable(reason),
        new_signups_7d: unavailable(reason),
        new_signups_30d: unavailable(reason)
      },
      gpt_usage: {
        inventory: unavailable(reason),
        public_gpts: unavailable(reason),
        rate_my_face_chats: unavailable("ChatGPT usage stats are not ingested; provide export/screenshot to wire."),
        action_calls: unavailable(reason)
      },
      revenue: {
        amazon_clicks: unavailable("No Amazon Associates snapshot stored"),
        amazon_revenue_usd: unavailable("No Amazon Associates snapshot stored"),
        stripe_revenue_usd: unavailable("Stripe USD revenue not stored in Postgres yet"),
        credits_sold: unavailable(reason),
        credits_consumed: unavailable(reason)
      },
      learning: {
        profiles_created: unavailable(reason),
        interactions_stored: unavailable(reason),
        recommendations_stored: unavailable(reason),
        compare_jobs: metric(0, "Paid Compare Action — no live jobs (vision limited)"),
        social_connections: unavailable(reason)
      }
    },
    credit_economy: {
      product_label: infra.product_credits.label,
      vercel_note: "Vercel Hobby / AI Gateway USD are hosting infrastructure — not product credits.",
      founder_grants: unavailable(reason),
      founder_grant_credits: unavailable(reason),
      signup_grants: unavailable(reason),
      stripe_packs_sold: unavailable(reason),
      stripe_pack_credits: unavailable(reason),
      stripe_events: unavailable(reason),
      usage_consumed: unavailable(reason),
      remaining_balance: unavailable(reason),
      top_ops: [],
      recent_ledger: [],
      tables: ["rmf_credit_accounts", "rmf_credit_ledger", "rmf_entitlements"],
      actions: {
        grant_founder_credits: true,
        view_ledger: true,
        revoke_suspicious_grants: true,
        inspect_consumption: true,
        auto_mutate_without_audit: false
      }
    },
    gpt_portfolio: {
      gpts: [],
      summary: { active: 0, draft: 0, public: 0, action_gpts: 0, amazon_linked: 0 },
      tables: ["rmf_agent_gpts", "rmf_agent_runs", "rmf_agent_signals"]
    },
    learning_console: {
      users_with_profiles: unavailable(reason),
      observations: unavailable("learning_events table not shipped yet"),
      recommendations: unavailable(reason),
      interactions: unavailable(reason),
      learning_events: unavailable("learning_events table not shipped yet"),
      recent_profiles: [],
      tables: [
        "rmf_users",
        "rmf_user_context",
        "rmf_personal_profiles",
        "rmf_interactions",
        "rmf_personal_recommendations"
      ],
      admin_note:
        "Paid Personal Network writes persist rmf_interactions and derive rmf_personal_recommendations when a product URL/title is present. Counts are live table rows (0 if empty) — never invented. Admin drill-down expands in PR #21 Learning Console."
    },
    compare_me_to_me: {
      status: COMPARE_ME_TO_ME.dashboard_status,
      enabled: COMPARE_ME_TO_ME.enabled,
      jobs_queued: metric(0, "Paid Action — schema not applied"),
      jobs_running: metric(0, "Paid Action — schema not applied"),
      jobs_completed: metric(0, "Paid Action — schema not applied"),
      results: unavailable("Paid Action — results unavailable until schema is applied"),
      gate: COMPARE_ME_TO_ME.gate,
      future_tables: [...COMPARE_ME_TO_ME.tables],
      schema_ready: false,
      vision_status: COMPARE_ME_TO_ME.vision_status,
      action_path: COMPARE_ME_TO_ME.action_path
    },
    appearance_agent: {
      status: APPEARANCE_AGENT.dashboard_status,
      enabled: APPEARANCE_AGENT.enabled,
      plans_total: metric(0, "Paid Action — schema not applied"),
      plans_draft: metric(0, "Paid Action — schema not applied"),
      plans_active: unavailable("Paid Action — active plans unavailable until schema is applied"),
      checkins: unavailable("Paid Action — check-ins unavailable until schema is applied"),
      gate: APPEARANCE_AGENT.gate,
      future_tables: [...APPEARANCE_AGENT.tables],
      schema_ready: false,
      note: APPEARANCE_AGENT.note,
      target_days: APPEARANCE_AGENT.target_days,
      depends_on: [...APPEARANCE_AGENT.depends_on],
      action_path: APPEARANCE_AGENT.action_path
    },
    social_providers: {
      status: "UNAVAILABLE",
      enabled: SOCIAL_PROVIDER_OAUTH.enabled,
      oauth_ready: SOCIAL_PROVIDER_OAUTH.enabled,
      scraping: SOCIAL_PROVIDER_OAUTH.scraping,
      auth_mode: SOCIAL_PROVIDER_OAUTH.auth_mode,
      planned: [...SOCIAL_PROVIDER_OAUTH.providers],
      configured_providers: SOCIAL_PROVIDER_OAUTH.configured_providers,
      connection_rows: unavailable(reason),
      connected: unavailable(reason),
      revoked: unavailable(reason),
      gate: SOCIAL_PROVIDER_OAUTH.gate,
      table: SOCIAL_PROVIDER_OAUTH.table,
      schema_ready: false,
      note: SOCIAL_PROVIDER_OAUTH.note
    },
    revenue_dashboard: {
      amazon_tag: "ratemyfacegpt-20",
      amazon_attribution: "Amazon Creators workaround attribution tag ratemyfacegpt-20 (searchProduct fallback).",
      amazon_clicks: unavailable("No Amazon Associates snapshot stored"),
      amazon_ordered_items: unavailable("No Amazon Associates snapshot stored"),
      amazon_earnings_usd: unavailable("No Amazon Associates snapshot stored"),
      stripe_products: `Credit packs of ${creditsPerPack()} (Stripe RMF product credits)`,
      stripe_purchases: unavailable(reason),
      stripe_refunds: unavailable("Stripe refunds not mirrored into Postgres yet"),
      stripe_usage_events: unavailable(reason),
      stripe_events_processed: unavailable(reason),
      tables: ["rmf_stripe_events", "rmf_credit_ledger"],
      product_vs_infra: infra.product_credits.note
    },
    operations_health: {
      vercel: { status: "hobby_active", note: infra.vercel_hosting.note },
      supabase: { status: "not_configured", note: "POSTGRES_URL / DATABASE_URL missing" },
      railway: {
        status: process.env.RMF_BROWSER_CONTROL_URL ? "configured" : "connect_later",
        note: process.env.RMF_BROWSER_CONTROL_URL
          ? "Browser control URL configured; live Railway metrics not ingested."
          : "Railway browser control not configured."
      },
      github: { status: "assumed_connected", note: "Live GitHub health not polled by this API." },
      actions: {
        status: process.env.GPT_ACTION_SECRET ? "configured" : "partial",
        note: process.env.GPT_ACTION_SECRET
          ? "GPT Action secret configured."
          : "GPT_ACTION_SECRET not set."
      },
      stripe: {
        status: "partial",
        note: "Env-only view until database connected."
      },
      latest_deploy_sha: deploySha() ? deploySha()!.slice(0, 12) : null,
      recent_errors: [],
      failed_actions: unavailable(reason),
      auth_failures: unavailable("Auth failure telemetry not persisted yet"),
      pending_approvals: 0
    },
    ops
  };
}

/** JSON-safe dashboard when the operator read times out — metrics are UNAVAILABLE, not fake zeros. */
export function getUnavailableOperatorDashboard(reason = "database_timeout"): DashboardV2 {
  const ops = unavailableOperatorOpsRead(reason);
  const note =
    reason === "database_timeout"
      ? "Postgres did not respond in time. Counts are UNAVAILABLE — not zero."
      : String(reason);
  const base = emptyDashboard(ops, note);
  base.ops = ops;
  base.database_configured = databaseConfigured();
  base.counts_available = false;
  base.ops_read_error = reason;
  base.operations_health.supabase = {
    status: "unavailable",
    note
  };
  return base;
}

export async function getOperatorDashboardV2(): Promise<DashboardV2> {
  const ops = await getOperatorOpsRead();

  if (!databaseConfigured() || !ops.database_configured) {
    const base = emptyDashboard(ops);
    base.ops = ops;
    base.database_configured = Boolean(ops.database_configured);
    // Prefer live billing stripe status from ops when available.
    const stripeOk =
      ops.billing?.stripe?.secret_configured &&
      ops.billing?.stripe?.credit_price_configured &&
      ops.billing?.stripe?.webhook_configured;
    base.operations_health.stripe = {
      status: stripeOk ? "configured" : "partial",
      note: ops.billing?.revenue_mapping || base.operations_health.stripe.note
    };
    return base;
  }

  const sql = db();
  return await sql.begin(async (tx) => {
    await tx`set local statement_timeout = '4000ms'`;
    await tx`set local lock_timeout = '1500ms'`;

    const existing = await existingPublicTables(tx, [
      "rmf_credit_accounts",
      "rmf_credit_ledger",
      "rmf_stripe_events",
      "rmf_personal_profiles",
      "rmf_interactions",
      "rmf_personal_recommendations",
      "rmf_provider_connections",
      "rmf_users",
      "rmf_compare_jobs",
      "rmf_compare_results",
      "rmf_appearance_plans",
      "rmf_appearance_checkins",
      "rmf_learning_events"
    ]);
    const hasCredits = existing.has("rmf_credit_accounts");
    const hasLedger = existing.has("rmf_credit_ledger");
    const hasStripeEvents = existing.has("rmf_stripe_events");
    const hasProfiles = existing.has("rmf_personal_profiles");
    const hasInteractions = existing.has("rmf_interactions");
    const hasRecs = existing.has("rmf_personal_recommendations");
    const hasProviders = existing.has("rmf_provider_connections");
    const hasUsers = existing.has("rmf_users");
    const hasCompareJobs = existing.has("rmf_compare_jobs");
    const hasCompareResults = existing.has("rmf_compare_results");
    const hasAppearancePlans = existing.has("rmf_appearance_plans");
    const hasAppearanceCheckins = existing.has("rmf_appearance_checkins");
    const hasLearningEvents = existing.has("rmf_learning_events");

    // Users / activity from auth + oauth
    let totalUsers = metric(asNumber(ops.accounts?.auth_users), "Supabase auth.users");
    let active7d: MetricValue = unavailable("auth.users last_sign_in_at not readable");
    let active30d: MetricValue = unavailable("auth.users last_sign_in_at not readable");
    let new7d: MetricValue = unavailable("auth.users created_at not readable");
    let new30d: MetricValue = unavailable("auth.users created_at not readable");

    try {
      const authActivity = await tx`
        select
          count(*)::int as total,
          count(*) filter (where last_sign_in_at >= now() - interval '7 days')::int as active_7d,
          count(*) filter (where last_sign_in_at >= now() - interval '30 days')::int as active_30d,
          count(*) filter (where created_at >= now() - interval '7 days')::int as new_7d,
          count(*) filter (where created_at >= now() - interval '30 days')::int as new_30d
        from auth.users
      `;
      totalUsers = metric(asNumber(authActivity[0]?.total), "Supabase auth.users");
      active7d = metric(asNumber(authActivity[0]?.active_7d), "last_sign_in_at within 7d");
      active30d = metric(asNumber(authActivity[0]?.active_30d), "last_sign_in_at within 30d");
      new7d = metric(asNumber(authActivity[0]?.new_7d), "created_at within 7d");
      new30d = metric(asNumber(authActivity[0]?.new_30d), "created_at within 30d");
    } catch {
      // Keep unavailable / ops fallback totals
      totalUsers = metric(asNumber(ops.accounts?.auth_users), "Supabase auth.users (count only)");
    }

    const amazon = (ops.commerce?.amazon || null) as Record<string, unknown> | null;
    const amazonClicks = amazon
      ? metric(asNumber(amazon.clicks), "Associates snapshot")
      : unavailable("No Amazon Associates snapshot stored");
    const amazonRevenue = amazon
      ? metric(asNumber(amazon.earnings_usd), "Associates snapshot USD")
      : unavailable("No Amazon Associates snapshot stored");
    const amazonOrdered = amazon
      ? metric(asNumber(amazon.ordered_items), "Associates snapshot")
      : unavailable("No Amazon Associates snapshot stored");

    let creditsSold: MetricValue = unavailable("rmf_credit_accounts missing");
    let creditsConsumed: MetricValue = unavailable("rmf_credit_accounts missing");
    let remaining: MetricValue = unavailable("rmf_credit_accounts missing");
    if (hasCredits) {
      creditsSold = metric(asNumber(ops.billing?.lifetime_purchased), "lifetime_purchased (Stripe packs)");
      creditsConsumed = metric(asNumber(ops.billing?.lifetime_spent), "lifetime_spent");
      remaining = metric(asNumber(ops.billing?.total_credit_balance), "sum of account balances");
    }

    let founderGrants: MetricValue = unavailable("rmf_credit_ledger missing");
    let founderGrantCredits: MetricValue = unavailable("rmf_credit_ledger missing");
    let signupGrants: MetricValue = unavailable("rmf_credit_ledger missing");
    let stripePacks: MetricValue = unavailable("rmf_credit_ledger missing");
    let stripePackCredits: MetricValue = unavailable("rmf_credit_ledger missing");
    let usageEvents: MetricValue = unavailable("rmf_credit_ledger missing");
    let topOps: DashboardV2["credit_economy"]["top_ops"] = ops.billing?.usage_by_action_30d || [];
    let recentLedger = ops.billing?.recent_credit_ledger || [];

    if (hasLedger) {
      const grantStats = await tx`
        select
          count(*) filter (where reason = 'operator_grant')::int as founder_events,
          coalesce(sum(delta) filter (where reason = 'operator_grant'), 0)::bigint as founder_credits,
          count(*) filter (where reason = 'signup_grant')::int as signup_events,
          count(*) filter (where reason = 'purchase')::int as purchase_events,
          coalesce(sum(delta) filter (where reason = 'purchase'), 0)::bigint as purchase_credits,
          count(*) filter (where reason = 'usage' or delta < 0)::int as usage_events
        from rmf_credit_ledger
      `;
      founderGrants = metric(asNumber(grantStats[0]?.founder_events), "operator_grant ledger rows");
      founderGrantCredits = metric(asNumber(grantStats[0]?.founder_credits), "sum of operator_grant deltas");
      signupGrants = metric(asNumber(grantStats[0]?.signup_events), "signup_grant ledger rows");
      stripePacks = metric(asNumber(grantStats[0]?.purchase_events), "purchase ledger rows (packs)");
      stripePackCredits = metric(asNumber(grantStats[0]?.purchase_credits), "sum of purchase deltas");
      usageEvents = metric(asNumber(grantStats[0]?.usage_events), "usage / negative delta rows");
    }

    let stripeEventsCount: MetricValue = unavailable("rmf_stripe_events missing");
    if (hasStripeEvents) {
      const ev = await tx`select count(*)::int as total from rmf_stripe_events`;
      stripeEventsCount = metric(asNumber(ev[0]?.total), "processed Stripe webhook events");
    }

    let profilesCreated: MetricValue = unavailable("rmf_personal_profiles missing");
    let recentProfiles: DashboardV2["learning_console"]["recent_profiles"] = [];
    if (hasProfiles) {
      profilesCreated = metric(asNumber(ops.billing?.personal_profiles), "rmf_personal_profiles rows");
      const rows = await tx`
        select user_id, updated_at
        from rmf_personal_profiles
        order by updated_at desc
        limit 12
      `;
      recentProfiles = rows.map((r: any) => ({
        user_id: String(r.user_id).slice(0, 12) + (String(r.user_id).length > 12 ? "…" : ""),
        updated_at: String(r.updated_at)
      }));
    }

    let interactionsStored: MetricValue = unavailable("rmf_interactions missing");
    if (hasInteractions) {
      const rows = await tx`select count(*)::int as total from rmf_interactions`;
      interactionsStored = metric(asNumber(rows[0]?.total), "rmf_interactions rows");
    }

    let recommendations: MetricValue = unavailable("rmf_personal_recommendations missing");
    if (hasRecs) {
      const rows = await tx`select count(*)::int as total from rmf_personal_recommendations`;
      recommendations = metric(asNumber(rows[0]?.total), "rmf_personal_recommendations rows");
    }

    let socialConnections: MetricValue = unavailable("rmf_provider_connections missing");
    let socialConnected: MetricValue = unavailable("rmf_provider_connections missing");
    let socialRevoked: MetricValue = unavailable("rmf_provider_connections missing");
    if (hasProviders) {
      const rows = await tx`
        select
          count(*)::int as total,
          count(*) filter (where status = 'connected')::int as connected,
          count(*) filter (where status = 'revoked')::int as revoked
        from rmf_provider_connections
      `;
      socialConnections = metric(
        asNumber(rows[0]?.total),
        "provider connection rows (live count; 0 if none)"
      );
      socialConnected = metric(
        asNumber(rows[0]?.connected),
        "status=connected (TikTok OAuth when secrets exist)"
      );
      socialRevoked = metric(asNumber(rows[0]?.revoked), "status=revoked rows");
    }

    let usersWithProfiles: MetricValue = profilesCreated;
    if (hasUsers) {
      const rows = await tx`select count(*)::int as total from rmf_users`;
      usersWithProfiles = metric(asNumber(rows[0]?.total), "rmf_users rows");
    }

    const learningEvents: MetricValue = hasLearningEvents
      ? await (async () => {
          const rows = await tx`select count(*)::int as total from rmf_learning_events`;
          return metric(asNumber(rows[0]?.total), "rmf_learning_events");
        })()
      : unavailable("learning_events table not shipped yet");

    // Paid Compare Action. When tables exist, report live counts — never invent numbers.
    // Status is PAID, not a LIVE unlimited-vision marketing claim.
    let compareQueued: MetricValue = metric(0, "Paid Action — jobs table not applied (vision limited)");
    let compareRunning: MetricValue = metric(0, "Paid Action — jobs table not applied (vision limited)");
    let compareCompleted: MetricValue = metric(0, "Paid Action — jobs table not applied (vision limited)");
    let compareResults: MetricValue = unavailable(
      "Paid Action — results unavailable until schema is applied (vision limited)"
    );
    if (hasCompareJobs) {
      const rows = await tx`
        select
          count(*) filter (where status = 'queued')::int as queued,
          count(*) filter (where status = 'running')::int as running,
          count(*) filter (where status = 'completed')::int as completed
        from rmf_compare_jobs
      `;
      compareQueued = metric(asNumber(rows[0]?.queued), "Paid Action — live queued count (vision limited)");
      compareRunning = metric(asNumber(rows[0]?.running), "Paid Action — live running count (vision limited)");
      compareCompleted = metric(
        asNumber(rows[0]?.completed),
        "Paid Action — live completed count (vision limited)"
      );
    }
    if (hasCompareResults) {
      const rows = await tx`select count(*)::int as total from rmf_compare_results`;
      compareResults = metric(
        asNumber(rows[0]?.total),
        "Paid Action — live results count (vision limited)"
      );
    }

    // Appearance Agent is a paid Action (not LIVE unlimited coaching). When tables exist,
    // report live counts; never invent nonzero activity.
    let appearancePlansTotal: MetricValue = metric(
      0,
      "Paid Action — plans table not applied · not LIVE unlimited coaching"
    );
    let appearancePlansDraft: MetricValue = metric(0, "Paid Action — plans table not applied");
    let appearancePlansActive: MetricValue = unavailable(
      "Paid Action — active plans unavailable until schema is applied"
    );
    let appearanceCheckins: MetricValue = unavailable(
      "Paid Action — check-ins unavailable until schema is applied"
    );
    if (hasAppearancePlans) {
      const rows = await tx`
        select
          count(*)::int as total,
          count(*) filter (where status = 'draft')::int as draft,
          count(*) filter (where status = 'active')::int as active
        from rmf_appearance_plans
      `;
      appearancePlansTotal = metric(
        asNumber(rows[0]?.total),
        "Paid Action — live plan count (not LIVE unlimited coaching)"
      );
      appearancePlansDraft = metric(
        asNumber(rows[0]?.draft),
        "Paid Action — live draft count"
      );
      appearancePlansActive = metric(
        asNumber(rows[0]?.active),
        "Paid Action — live active count"
      );
    }
    if (hasAppearanceCheckins) {
      const rows = await tx`select count(*)::int as total from rmf_appearance_checkins`;
      appearanceCheckins = metric(
        asNumber(rows[0]?.total),
        "Paid Action — live check-in count"
      );
    }

    // Action calls proxy: credit usage events + agent receipts (not ChatGPT chat count)
    const actionCalls = hasLedger
      ? metric(
          asNumber(
            (ops.billing?.usage_by_action_30d || []).reduce((sum, r) => sum + asNumber(r.events), 0)
          ),
          "Metered Action credit events · 30d (not ChatGPT chat count)"
        )
      : unavailable("No credit ledger usage to proxy Action calls");

    const failedRuns = (ops.recent_runs || []).filter(
      (r: any) => r.status === "failed" || r.error
    );

    const stripeOk =
      ops.billing?.stripe?.secret_configured &&
      ops.billing?.stripe?.credit_price_configured &&
      ops.billing?.stripe?.webhook_configured;

    const sha = deploySha();
    const gpts = (ops.gpts || []).map((g: any) => {
      const chatRaw = g.config?.chat_count_reported;
      const chatsReported =
        chatRaw == null || chatRaw === ""
          ? unavailable("ChatGPT chat count not reported in GPT config")
          : metric(asNumber(chatRaw), "Reported in GPT config (manual)");
      return {
        id: Number(g.id),
        gpt_key: String(g.gpt_key),
        name: String(g.name),
        status: String(g.status),
        platform: String(g.platform || "chatgpt"),
        visibility: String(g.config?.visibility || "—"),
        actions: Boolean(g.config?.actions),
        amazon_links: Boolean(g.config?.amazon_links),
        chats_reported: chatsReported,
        retention: unavailable("Retention not measured yet"),
        revenue: unavailable("Per-GPT revenue attribution not wired"),
        amazon_tracking_id: String(g.config?.amazon_tracking_id || "—"),
        updated_at: String(g.updated_at)
      };
    });

    const infra = infrastructureCreditBoundary();

    return {
      ok: true,
      version: "dashboard_v2" as const,
      database_configured: true,
      counts_available: true,
      generated_at: new Date().toISOString(),
      business_overview: {
        users: {
          total: totalUsers,
          active_7d: active7d,
          active_30d: active30d,
          new_signups_7d: new7d,
          new_signups_30d: new30d
        },
        gpt_usage: {
          inventory: metric(asNumber(ops.counts?.gpts), "rmf_agent_gpts inventory"),
          public_gpts: metric(asNumber(ops.portfolio?.public_gpts), "config.visibility=public"),
          rate_my_face_chats: unavailable(
            "ChatGPT GPT usage stats are not ingested; provide export/screenshot to wire."
          ),
          action_calls: actionCalls
        },
        revenue: {
          amazon_clicks: amazonClicks,
          amazon_revenue_usd: amazonRevenue,
          stripe_revenue_usd: unavailable(
            "Stripe USD revenue not stored in Postgres — credits sold are the product meter"
          ),
          credits_sold: creditsSold,
          credits_consumed: creditsConsumed
        },
        learning: {
          profiles_created: profilesCreated,
          interactions_stored: interactionsStored,
          recommendations_stored: recommendations,
          compare_jobs: hasCompareJobs
            ? compareCompleted
            : metric(0, "Paid Compare Action — jobs table not applied (vision limited)"),
          social_connections: socialConnections
        }
      },
      credit_economy: {
        product_label: infra.product_credits.label,
        vercel_note:
          "Vercel Hobby / AI Gateway USD are hosting infrastructure — not Stripe RMF product credits.",
        founder_grants: founderGrants,
        founder_grant_credits: founderGrantCredits,
        signup_grants: signupGrants,
        stripe_packs_sold: stripePacks,
        stripe_pack_credits: stripePackCredits,
        stripe_events: stripeEventsCount,
        usage_consumed: creditsConsumed,
        remaining_balance: remaining,
        top_ops: topOps,
        recent_ledger: recentLedger,
        tables: ["rmf_credit_accounts", "rmf_credit_ledger", "rmf_entitlements"],
        actions: {
          grant_founder_credits: true,
          view_ledger: true,
          revoke_suspicious_grants: true,
          inspect_consumption: true,
          auto_mutate_without_audit: false
        }
      },
      gpt_portfolio: {
        gpts,
        summary: {
          active: asNumber(ops.portfolio?.active_gpts),
          draft: asNumber(ops.portfolio?.draft_gpts),
          public: asNumber(ops.portfolio?.public_gpts),
          action_gpts: asNumber(ops.portfolio?.action_gpts),
          amazon_linked: asNumber(ops.portfolio?.amazon_linked_gpts)
        },
        tables: ["rmf_agent_gpts", "rmf_agent_runs", "rmf_agent_signals"]
      },
      learning_console: {
        users_with_profiles: usersWithProfiles,
        observations: learningEvents.available
          ? learningEvents
          : unavailable("Observations/learning_events not shipped — PR #21"),
        recommendations,
        interactions: interactionsStored,
        learning_events: learningEvents,
        recent_profiles: recentProfiles,
        tables: [
          "rmf_users",
          "rmf_user_context",
          "rmf_personal_profiles",
          "rmf_interactions",
          "rmf_personal_recommendations"
        ],
        admin_note:
          "Paid Personal Network writes persist rmf_interactions and derive rmf_personal_recommendations when a product URL/title is present. Counts are live table rows (0 if empty) — never invented. Admin user drill-down ships in PR #21. Signup bootstrap credits=" +
          String(signupCredits()) +
          "."
      },
      compare_me_to_me: {
        status: COMPARE_ME_TO_ME.dashboard_status,
        enabled: COMPARE_ME_TO_ME.enabled,
        jobs_queued: compareQueued,
        jobs_running: compareRunning,
        jobs_completed: compareCompleted,
        results: compareResults,
        gate: COMPARE_ME_TO_ME.gate,
        future_tables: [...COMPARE_ME_TO_ME.tables],
        schema_ready: hasCompareJobs && hasCompareResults,
        vision_status: COMPARE_ME_TO_ME.vision_status,
        action_path: COMPARE_ME_TO_ME.action_path
      },
      appearance_agent: {
        status: APPEARANCE_AGENT.dashboard_status,
        enabled: APPEARANCE_AGENT.enabled,
        plans_total: appearancePlansTotal,
        plans_draft: appearancePlansDraft,
        plans_active: appearancePlansActive,
        checkins: appearanceCheckins,
        gate: APPEARANCE_AGENT.gate,
        future_tables: [...APPEARANCE_AGENT.tables],
        schema_ready: hasAppearancePlans && hasAppearanceCheckins,
        note: APPEARANCE_AGENT.note,
        target_days: APPEARANCE_AGENT.target_days,
        depends_on: [...APPEARANCE_AGENT.depends_on],
        action_path: APPEARANCE_AGENT.action_path
      },
      social_providers: {
        status: SOCIAL_PROVIDER_OAUTH.enabled
          ? "LIVE"
          : "NOT_CONFIGURED",
        enabled: SOCIAL_PROVIDER_OAUTH.enabled,
        oauth_ready: SOCIAL_PROVIDER_OAUTH.enabled,
        scraping: SOCIAL_PROVIDER_OAUTH.scraping,
        auth_mode: SOCIAL_PROVIDER_OAUTH.auth_mode,
        planned: [...SOCIAL_PROVIDER_OAUTH.providers],
        configured_providers: SOCIAL_PROVIDER_OAUTH.configured_providers,
        connection_rows: socialConnections,
        connected: hasProviders
          ? socialConnected
          : unavailable("rmf_provider_connections missing"),
        revoked: hasProviders
          ? socialRevoked
          : unavailable("rmf_provider_connections missing"),
        gate: SOCIAL_PROVIDER_OAUTH.gate,
        table: SOCIAL_PROVIDER_OAUTH.table,
        schema_ready: hasProviders,
        note: SOCIAL_PROVIDER_OAUTH.note
      },
      revenue_dashboard: {
        amazon_tag: "ratemyfacegpt-20",
        amazon_attribution:
          "Amazon Creators workaround attribution tag ratemyfacegpt-20 (searchProduct fallback). Leave Amazon Creators API alone.",
        amazon_clicks: amazonClicks,
        amazon_ordered_items: amazonOrdered,
        amazon_earnings_usd: amazonRevenue,
        stripe_products: `Credit packs of ${creditsPerPack()} · Stripe RMF product credits (not Vercel)`,
        stripe_purchases: stripePacks,
        stripe_refunds: unavailable("Stripe refunds not mirrored into Postgres yet"),
        stripe_usage_events: usageEvents,
        stripe_events_processed: stripeEventsCount,
        tables: ["rmf_stripe_events", "rmf_credit_ledger"],
        product_vs_infra: infra.product_credits.note
      },
      operations_health: {
        vercel: {
          status: "hobby_active",
          note: infra.vercel_hosting.note
        },
        supabase: {
          status: "connected",
          note: "Postgres reachable via POSTGRES_URL / DATABASE_URL"
        },
        railway: {
          status: process.env.RMF_BROWSER_CONTROL_URL ? "configured" : "connect_later",
          note: process.env.RMF_BROWSER_CONTROL_URL
            ? "Browser control URL configured; live Railway metrics not ingested."
            : "Railway browser control not configured."
        },
        github: {
          status: "assumed_connected",
          note: "Live GitHub health not polled by this API."
        },
        actions: {
          status: process.env.GPT_ACTION_SECRET ? "configured" : "partial",
          note: process.env.GPT_ACTION_SECRET
            ? "GPT Action secret configured."
            : "GPT_ACTION_SECRET not set."
        },
        stripe: {
          status: stripeOk ? "configured" : "partial",
          note: ops.billing?.revenue_mapping || "Stripe product credit wiring incomplete"
        },
        latest_deploy_sha: sha ? sha.slice(0, 12) : null,
        recent_errors: failedRuns.slice(0, 8).map((r: any) => ({
          id: Number(r.id),
          model: r.model ?? null,
          error: r.error ?? null,
          created_at: String(r.created_at)
        })),
        failed_actions: metric(
          failedRuns.length,
          "Failed/error agent runs in recent window (not GPT Action HTTP failures)"
        ),
        auth_failures: unavailable("Auth failure telemetry not persisted yet"),
        pending_approvals: asNumber(ops.counts?.approvals_pending)
      },
      ops
    };
  });
}
