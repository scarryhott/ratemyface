import { createHash } from "node:crypto";

export const PROTECTED_GPT_KEY = "rate_my_face";
export const PROTECTED_GPT_INSTRUCTION_HASH =
  "b561dd48b11dfc052601a1ce1ca53aff1961fa74f7e3c8749a5c487931cf47dc";

export const CONTROL_TABLES = [
  "rmf_control_features",
  "rmf_control_feature_evidence",
  "rmf_control_agent_identities",
  "rmf_control_gpt_specs",
  "rmf_control_gpt_jobs",
  "rmf_control_metric_snapshots"
] as const;

export const FEATURE_CATEGORIES = [
  "product",
  "access",
  "agent",
  "gpt_factory",
  "analytics",
  "money",
  "integration"
] as const;

export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];
export type FeatureLifecycle = "planned" | "building" | "testing" | "active" | "blocked" | "retired";
export type FeatureAccess = "not_started" | "partial" | "authorized" | "available" | "blocked";
export type MonetizationStatus = "not_applicable" | "planned" | "configured" | "measuring" | "earning" | "blocked";
export type EvidenceStatus = "unverified" | "partial" | "verified" | "failed" | "stale";

export type UnifiedFeatureSeed = {
  feature_key: string;
  name: string;
  category: FeatureCategory;
  lifecycle_status: FeatureLifecycle;
  access_status: FeatureAccess;
  monetization_status: MonetizationStatus;
  evidence_status: EvidenceStatus;
  priority: number;
};

export const UNIFIED_FEATURE_SEEDS: readonly UnifiedFeatureSeed[] = [
  { feature_key: "account_learning", name: "Account Learning", category: "product", lifecycle_status: "active", access_status: "available", monetization_status: "configured", evidence_status: "partial", priority: 1 },
  { feature_key: "compare_me_to_me", name: "Compare Me To Me", category: "product", lifecycle_status: "active", access_status: "available", monetization_status: "configured", evidence_status: "partial", priority: 2 },
  { feature_key: "appearance_agent", name: "Appearance Agent", category: "product", lifecycle_status: "active", access_status: "available", monetization_status: "configured", evidence_status: "partial", priority: 3 },
  { feature_key: "personal_experiments", name: "Personal Experiments", category: "product", lifecycle_status: "active", access_status: "available", monetization_status: "configured", evidence_status: "partial", priority: 4 },
  { feature_key: "personal_intelligence", name: "Personal Intelligence", category: "product", lifecycle_status: "active", access_status: "available", monetization_status: "configured", evidence_status: "partial", priority: 5 },
  { feature_key: "social_oauth", name: "Social OAuth", category: "integration", lifecycle_status: "testing", access_status: "partial", monetization_status: "not_applicable", evidence_status: "partial", priority: 6 },
  { feature_key: "credit_checkout", name: "Credit Checkout", category: "money", lifecycle_status: "active", access_status: "available", monetization_status: "measuring", evidence_status: "partial", priority: 7 },
  { feature_key: "affiliate_attribution", name: "Affiliate Attribution", category: "money", lifecycle_status: "testing", access_status: "partial", monetization_status: "measuring", evidence_status: "partial", priority: 8 },
  { feature_key: "codex_agent_account", name: "Codex Agent Account", category: "access", lifecycle_status: "planned", access_status: "not_started", monetization_status: "not_applicable", evidence_status: "unverified", priority: 9 },
  { feature_key: "full_feature_access", name: "Full Authorized Feature Access", category: "access", lifecycle_status: "building", access_status: "partial", monetization_status: "not_applicable", evidence_status: "partial", priority: 10 },
  { feature_key: "automatic_gpt_creator", name: "Automatic GPT Creator", category: "gpt_factory", lifecycle_status: "building", access_status: "partial", monetization_status: "planned", evidence_status: "partial", priority: 11 },
  { feature_key: "vercel_business_dashboard", name: "Vercel Business Dashboard", category: "analytics", lifecycle_status: "building", access_status: "partial", monetization_status: "measuring", evidence_status: "partial", priority: 12 },
  { feature_key: "feature_monitor_adder", name: "Feature Monitor and Adder", category: "agent", lifecycle_status: "building", access_status: "authorized", monetization_status: "not_applicable", evidence_status: "partial", priority: 13 },
  { feature_key: "monetary_intelligence", name: "Monetary Intelligence", category: "money", lifecycle_status: "building", access_status: "partial", monetization_status: "measuring", evidence_status: "partial", priority: 14 }
] as const;

export type UnifiedFeatureView = UnifiedFeatureSeed & {
  source_of_truth: string;
  endpoint: string | null;
  database_objects: string[];
  acceptance: string[];
  last_verified_at: string | null;
  latest_evidence: {
    evidence_type: string;
    provider: string;
    observed_state: string;
    passed: boolean;
    observed_at: string;
    external_ref: string | null;
  } | null;
};

export type UnifiedControlPlaneView = {
  schema_ready: boolean;
  reason: string | null;
  tables: readonly string[];
  summary: { total: number; active: number; verified: number; blocked: number; gaps: number };
  features: UnifiedFeatureView[];
  agents: Array<{
    agent_key: string;
    display_name: string;
    role: string;
    status: string;
    feature_access: string;
    auth_user_linked: boolean;
    entitlement_count: number;
    last_verified_at: string | null;
  }>;
  gpt_factory: {
    protected_gpt: {
      gpt_key: typeof PROTECTED_GPT_KEY;
      creator_mode: "human_only";
      factory_enabled: false;
      instruction_hash: string;
    };
    factory_enabled_specs: number;
    queued: number;
    running: number;
    awaiting_human: number;
    completed: number;
    failed: number;
  };
  monetary_snapshots: Array<{
    source: string;
    metric_key: string;
    numeric_value: string | null;
    text_value: string | null;
    unit: string;
    observed_at: string;
    source_ref: string | null;
  }>;
};

function defaultFeatureView(seed: UnifiedFeatureSeed): UnifiedFeatureView {
  return {
    ...seed,
    source_of_truth: "repository_seed",
    endpoint: null,
    database_objects: [],
    acceptance: [],
    last_verified_at: null,
    latest_evidence: null
  };
}

export function summarizeUnifiedFeatures(features: UnifiedFeatureView[]) {
  return {
    total: features.length,
    active: features.filter((feature) => feature.lifecycle_status === "active").length,
    verified: features.filter((feature) => feature.evidence_status === "verified").length,
    blocked: features.filter((feature) => feature.lifecycle_status === "blocked" || feature.access_status === "blocked").length,
    gaps: features.filter((feature) => feature.lifecycle_status !== "active" || feature.evidence_status !== "verified").length
  };
}

export function unavailableUnifiedControlPlane(reason: string): UnifiedControlPlaneView {
  const features = UNIFIED_FEATURE_SEEDS.map(defaultFeatureView);
  return {
    schema_ready: false,
    reason,
    tables: CONTROL_TABLES,
    summary: summarizeUnifiedFeatures(features),
    features,
    agents: [{
      agent_key: "codex",
      display_name: "Codex unified operator",
      role: "feature_agent",
      status: "provisioning_required",
      feature_access: "scoped",
      auth_user_linked: false,
      entitlement_count: 0,
      last_verified_at: null
    }],
    gpt_factory: {
      protected_gpt: {
        gpt_key: PROTECTED_GPT_KEY,
        creator_mode: "human_only",
        factory_enabled: false,
        instruction_hash: PROTECTED_GPT_INSTRUCTION_HASH
      },
      factory_enabled_specs: 0,
      queued: 0,
      running: 0,
      awaiting_human: 0,
      completed: 0,
      failed: 0
    },
    monetary_snapshots: []
  };
}

function canonicalKey(value: unknown, field: string): string {
  const key = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!/^[a-z0-9][a-z0-9_]{1,79}$/.test(key)) throw new Error(`${field}_invalid`);
  return key;
}

function stringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, max);
}

export type FeatureRegistration = {
  feature_key: string;
  name: string;
  category: FeatureCategory;
  lifecycle_status: FeatureLifecycle;
  access_status: FeatureAccess;
  monetization_status: MonetizationStatus;
  source_of_truth: "database" | "github" | "vercel" | "stripe" | "supabase" | "openai" | "railway" | "manual";
  endpoint: string | null;
  database_objects: string[];
  acceptance: string[];
  priority: number;
};

export function normalizeFeatureRegistration(input: Record<string, unknown>): FeatureRegistration {
  const featureKey = canonicalKey(input.feature_key, "feature_key");
  const name = String(input.name || "").trim().slice(0, 160);
  if (!name) throw new Error("feature_name_required");
  const category = String(input.category || "product") as FeatureCategory;
  if (!FEATURE_CATEGORIES.includes(category)) throw new Error("feature_category_invalid");
  const lifecycle = String(input.lifecycle_status || "planned") as FeatureLifecycle;
  if (!["planned", "building", "testing", "active", "blocked", "retired"].includes(lifecycle)) throw new Error("feature_lifecycle_invalid");
  const access = String(input.access_status || "not_started") as FeatureAccess;
  if (!["not_started", "partial", "authorized", "available", "blocked"].includes(access)) throw new Error("feature_access_invalid");
  const monetization = String(input.monetization_status || "not_applicable") as MonetizationStatus;
  if (!["not_applicable", "planned", "configured", "measuring", "earning", "blocked"].includes(monetization)) throw new Error("feature_monetization_invalid");
  const source = String(input.source_of_truth || "database") as FeatureRegistration["source_of_truth"];
  if (!["database", "github", "vercel", "stripe", "supabase", "openai", "railway", "manual"].includes(source)) throw new Error("feature_source_invalid");
  const endpoint = input.endpoint == null || input.endpoint === "" ? null : String(input.endpoint).slice(0, 500);
  const priority = Math.max(1, Math.min(100, Math.trunc(Number(input.priority || 50))));
  return {
    feature_key: featureKey,
    name,
    category,
    lifecycle_status: lifecycle,
    access_status: access,
    monetization_status: monetization,
    source_of_truth: source,
    endpoint,
    database_objects: stringArray(input.database_objects),
    acceptance: stringArray(input.acceptance),
    priority
  };
}

export type GptFactoryRequest = {
  gpt_key: string;
  name: string;
  configuration: Record<string, unknown>;
  idempotency_key: string;
};

export function normalizeGptFactoryRequest(input: Record<string, unknown>): GptFactoryRequest {
  const gptKey = canonicalKey(input.gpt_key, "gpt_key");
  if (gptKey === PROTECTED_GPT_KEY || gptKey === "ratemyface") {
    throw new Error("protected_rate_my_face_gpt_factory_forbidden");
  }
  const name = String(input.name || "").trim().slice(0, 160);
  if (!name) throw new Error("gpt_name_required");
  const configuration = input.configuration && typeof input.configuration === "object" && !Array.isArray(input.configuration)
    ? input.configuration as Record<string, unknown>
    : {};
  const suppliedKey = String(input.idempotency_key || "").trim();
  const idempotencyKey = (suppliedKey || createHash("sha256")
    .update(JSON.stringify({ gpt_key: gptKey, name, configuration }))
    .digest("hex")).slice(0, 160);
  return { gpt_key: gptKey, name, configuration, idempotency_key: idempotencyKey };
}

export type BusinessMetricProjectionInput = {
  captured_at: string;
  auth_users: number | null;
  oauth_users: number | null;
  personal_profiles: number | null;
  interactions: number | null;
  personal_recommendations: number | null;
  credit_balance_total: number | null;
  lifetime_purchased: number | null;
  lifetime_spent: number | null;
  stripe_events: number | null;
  agent_runs_7d: number | null;
  agent_signals_queued: number | null;
  pending_approvals: number | null;
  credits_per_pack: number;
  signup_credits: number;
};

export type UnifiedMetricSnapshotInput = {
  source: "supabase" | "product" | "stripe";
  metric_key: string;
  numeric_value: number;
  unit: "count" | "credits";
};

/** Project only authoritative counters. Revenue and cost require provider evidence. */
export function projectBusinessMetricSnapshots(
  snapshot: BusinessMetricProjectionInput
): UnifiedMetricSnapshotInput[] {
  const candidates: Array<Omit<UnifiedMetricSnapshotInput, "numeric_value"> & { numeric_value: number | null }> = [
    { source: "supabase", metric_key: "auth.users", numeric_value: snapshot.auth_users, unit: "count" },
    { source: "supabase", metric_key: "oauth.users", numeric_value: snapshot.oauth_users, unit: "count" },
    { source: "supabase", metric_key: "personal.profiles", numeric_value: snapshot.personal_profiles, unit: "count" },
    { source: "supabase", metric_key: "personal.interactions", numeric_value: snapshot.interactions, unit: "count" },
    { source: "supabase", metric_key: "personal.recommendations", numeric_value: snapshot.personal_recommendations, unit: "count" },
    { source: "product", metric_key: "credits.balance", numeric_value: snapshot.credit_balance_total, unit: "credits" },
    { source: "product", metric_key: "credits.lifetime_purchased", numeric_value: snapshot.lifetime_purchased, unit: "credits" },
    { source: "product", metric_key: "credits.lifetime_spent", numeric_value: snapshot.lifetime_spent, unit: "credits" },
    { source: "stripe", metric_key: "webhook_events.processed", numeric_value: snapshot.stripe_events, unit: "count" },
    { source: "supabase", metric_key: "agent.runs_7d", numeric_value: snapshot.agent_runs_7d, unit: "count" },
    { source: "supabase", metric_key: "agent.signals_queued", numeric_value: snapshot.agent_signals_queued, unit: "count" },
    { source: "supabase", metric_key: "agent.approvals_pending", numeric_value: snapshot.pending_approvals, unit: "count" },
    { source: "product", metric_key: "credits.per_pack", numeric_value: snapshot.credits_per_pack, unit: "credits" },
    { source: "product", metric_key: "credits.signup_grant", numeric_value: snapshot.signup_credits, unit: "credits" }
  ];

  return candidates.filter(
    (metric): metric is UnifiedMetricSnapshotInput =>
      metric.numeric_value != null && Number.isFinite(metric.numeric_value)
  );
}
