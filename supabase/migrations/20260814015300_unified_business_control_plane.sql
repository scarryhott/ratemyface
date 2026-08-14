-- Unified business control plane for product features, agents, GPT factory
-- jobs, verification evidence, and monetary snapshots.
--
-- Trust model:
--   - These tables are server-only through POSTGRES_URL / DATABASE_URL.
--   - Anonymous and authenticated Data API roles receive no privileges.
--   - RLS remains enabled as a second boundary. Do NOT FORCE RLS because the
--     trusted Vercel server path must retain access.
--   - The protected Rate My Face GPT stores policy metadata and a hash only.
--     Its instruction text must never enter this control plane.

create table if not exists public.rmf_control_features (
  feature_key text primary key
    check (feature_key ~ '^[a-z0-9][a-z0-9_]{1,79}$'),
  name text not null check (length(btrim(name)) > 0),
  category text not null
    check (category in ('product', 'access', 'agent', 'gpt_factory', 'analytics', 'money', 'integration')),
  lifecycle_status text not null default 'planned'
    check (lifecycle_status in ('planned', 'building', 'testing', 'active', 'blocked', 'retired')),
  access_status text not null default 'not_started'
    check (access_status in ('not_started', 'partial', 'authorized', 'available', 'blocked')),
  monetization_status text not null default 'not_applicable'
    check (monetization_status in ('not_applicable', 'planned', 'configured', 'measuring', 'earning', 'blocked')),
  evidence_status text not null default 'unverified'
    check (evidence_status in ('unverified', 'partial', 'verified', 'failed', 'stale')),
  source_of_truth text not null default 'database'
    check (source_of_truth in ('database', 'github', 'vercel', 'stripe', 'supabase', 'openai', 'railway', 'manual')),
  endpoint text,
  database_objects jsonb not null default '[]'::jsonb
    check (jsonb_typeof(database_objects) = 'array'),
  acceptance jsonb not null default '[]'::jsonb
    check (jsonb_typeof(acceptance) = 'array'),
  priority smallint not null default 50 check (priority between 1 and 100),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rmf_control_feature_evidence (
  id bigserial primary key,
  feature_key text not null references public.rmf_control_features(feature_key) on delete cascade,
  evidence_type text not null
    check (evidence_type in ('production_health', 'test', 'deployment', 'provider', 'funnel', 'manual')),
  provider text not null,
  observed_state text not null default 'unknown',
  passed boolean not null default false,
  run_id bigint,
  operator_receipt_id bigint,
  external_ref text,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.rmf_control_agent_identities (
  agent_key text primary key
    check (agent_key ~ '^[a-z0-9][a-z0-9_]{1,79}$'),
  display_name text not null check (length(btrim(display_name)) > 0),
  auth_user_id uuid references auth.users(id) on delete set null,
  role text not null default 'operator'
    check (role in ('owner', 'operator', 'feature_agent', 'gpt_factory', 'observer')),
  status text not null default 'provisioning_required'
    check (status in ('provisioning_required', 'active', 'suspended', 'revoked')),
  feature_access text not null default 'scoped'
    check (feature_access in ('scoped', 'full_authorized', 'read_only', 'none')),
  entitlements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(entitlements) = 'array'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rmf_control_gpt_specs (
  gpt_key text primary key
    check (gpt_key ~ '^[a-z0-9][a-z0-9_]{1,79}$'),
  name text not null check (length(btrim(name)) > 0),
  protected boolean not null default false,
  creator_mode text not null default 'agent_factory'
    check (creator_mode in ('human_only', 'agent_factory')),
  factory_enabled boolean not null default true,
  status text not null default 'draft'
    check (status in ('protected', 'draft', 'queued', 'building', 'active', 'failed', 'archived')),
  external_id text,
  instruction_hash text
    check (instruction_hash is null or instruction_hash ~ '^[a-f0-9]{64}$'),
  agent_generated_configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(agent_generated_configuration) = 'object'),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rmf_control_gpt_specs_protected_mode_check check (
    not protected or (
      creator_mode = 'human_only'
      and factory_enabled = false
      and status = 'protected'
      and agent_generated_configuration = '{}'::jsonb
    )
  )
);

create table if not exists public.rmf_control_gpt_jobs (
  id bigserial primary key,
  gpt_key text not null references public.rmf_control_gpt_specs(gpt_key) on delete restrict,
  requested_by text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'awaiting_human', 'completed', 'failed', 'cancelled')),
  configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuration) = 'object'),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  protected_asset_check text not null default 'passed'
    check (protected_asset_check = 'passed'),
  external_ref text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rmf_control_gpt_jobs_never_protected_check
    check (gpt_key <> 'rate_my_face')
);

create table if not exists public.rmf_control_metric_snapshots (
  id bigserial primary key,
  source text not null
    check (source in ('stripe', 'vercel', 'supabase', 'openai', 'railway', 'github', 'amazon', 'product')),
  metric_key text not null
    check (metric_key ~ '^[a-z0-9][a-z0-9_.]{1,119}$'),
  numeric_value numeric,
  text_value text,
  unit text not null default 'count',
  dimensions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(dimensions) = 'object'),
  source_ref text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rmf_control_metric_snapshots_value_check
    check (numeric_value is not null or text_value is not null)
);

create index if not exists rmf_control_features_status_priority_idx
  on public.rmf_control_features(lifecycle_status, priority, feature_key);
create index if not exists rmf_control_feature_evidence_feature_observed_idx
  on public.rmf_control_feature_evidence(feature_key, observed_at desc);
create index if not exists rmf_control_feature_evidence_run_idx
  on public.rmf_control_feature_evidence(run_id) where run_id is not null;
create index if not exists rmf_control_agent_identities_auth_user_idx
  on public.rmf_control_agent_identities(auth_user_id) where auth_user_id is not null;
create index if not exists rmf_control_gpt_jobs_status_created_idx
  on public.rmf_control_gpt_jobs(status, created_at);
create index if not exists rmf_control_gpt_jobs_gpt_created_idx
  on public.rmf_control_gpt_jobs(gpt_key, created_at desc);
create index if not exists rmf_control_metric_snapshots_metric_observed_idx
  on public.rmf_control_metric_snapshots(source, metric_key, observed_at desc);

create or replace function public.rmf_control_reject_protected_gpt_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.gpt_key = 'rate_my_face' then
    raise exception 'rate_my_face_gpt_is_human_only_and_immutable_to_agents';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists rmf_control_protected_gpt_immutable
  on public.rmf_control_gpt_specs;
create trigger rmf_control_protected_gpt_immutable
  before update or delete on public.rmf_control_gpt_specs
  for each row execute function public.rmf_control_reject_protected_gpt_mutation();

alter table public.rmf_control_features enable row level security;
alter table public.rmf_control_feature_evidence enable row level security;
alter table public.rmf_control_agent_identities enable row level security;
alter table public.rmf_control_gpt_specs enable row level security;
alter table public.rmf_control_gpt_jobs enable row level security;
alter table public.rmf_control_metric_snapshots enable row level security;

revoke all on table public.rmf_control_features from anon, authenticated;
revoke all on table public.rmf_control_feature_evidence from anon, authenticated;
revoke all on table public.rmf_control_agent_identities from anon, authenticated;
revoke all on table public.rmf_control_gpt_specs from anon, authenticated;
revoke all on table public.rmf_control_gpt_jobs from anon, authenticated;
revoke all on table public.rmf_control_metric_snapshots from anon, authenticated;
revoke all on sequence public.rmf_control_feature_evidence_id_seq from anon, authenticated;
revoke all on sequence public.rmf_control_gpt_jobs_id_seq from anon, authenticated;
revoke all on sequence public.rmf_control_metric_snapshots_id_seq from anon, authenticated;
revoke execute on function public.rmf_control_reject_protected_gpt_mutation() from public;

insert into public.rmf_control_features (
  feature_key, name, category, lifecycle_status, access_status,
  monetization_status, evidence_status, source_of_truth, endpoint,
  database_objects, acceptance, priority, metadata
) values
  ('account_learning', 'Account Learning', 'product', 'active', 'available', 'configured', 'partial', 'vercel', '/api/personal', '["rmf_personal_profiles","rmf_interactions","rmf_personal_recommendations"]'::jsonb, '["production health passes","paid writes persist","credit use is metered"]'::jsonb, 1, '{"agent_monitored":true}'::jsonb),
  ('compare_me_to_me', 'Compare Me To Me', 'product', 'active', 'available', 'configured', 'partial', 'vercel', '/api/compare', '["rmf_compare_jobs","rmf_compare_results"]'::jsonb, '["production health passes","jobs and results persist","credit use is metered"]'::jsonb, 2, '{"agent_monitored":true}'::jsonb),
  ('appearance_agent', 'Appearance Agent', 'product', 'active', 'available', 'configured', 'partial', 'vercel', '/api/appearance', '["rmf_appearance_plans","rmf_appearance_checkins"]'::jsonb, '["production health passes","plans and check-ins persist","credit use is metered"]'::jsonb, 3, '{"agent_monitored":true}'::jsonb),
  ('personal_experiments', 'Personal Experiments', 'product', 'active', 'available', 'configured', 'partial', 'database', '/api/experiments', '["rmf_personal_experiments","rmf_personal_experiment_observations"]'::jsonb, '["consented experiments persist","evidence thresholds stay explicit"]'::jsonb, 4, '{"agent_monitored":true}'::jsonb),
  ('personal_intelligence', 'Personal Intelligence', 'product', 'active', 'available', 'configured', 'partial', 'database', '/api/personal-agent', '["rmf_personal_agent_runs","rmf_personal_agent_actions","rmf_personal_agent_receipts"]'::jsonb, '["agent actions require receipts","sparse evidence never becomes a conclusion"]'::jsonb, 5, '{"agent_monitored":true}'::jsonb),
  ('social_oauth', 'Social OAuth', 'integration', 'testing', 'partial', 'not_applicable', 'partial', 'vercel', '/api/providers', '["rmf_provider_connections"]'::jsonb, '["user-authorized OAuth only","raw provider tokens are never persisted"]'::jsonb, 6, '{"agent_monitored":true}'::jsonb),
  ('credit_checkout', 'Credit Checkout', 'money', 'active', 'available', 'measuring', 'partial', 'stripe', '/api/billing/credits/checkout', '["rmf_credit_accounts","rmf_credit_ledger","rmf_stripe_events"]'::jsonb, '["checkout completes","webhook grants credits exactly once","funnel is measured"]'::jsonb, 7, '{"agent_monitored":true}'::jsonb),
  ('affiliate_attribution', 'Affiliate Attribution', 'money', 'testing', 'partial', 'measuring', 'partial', 'manual', '/api/product', '[]'::jsonb, '["tag remains attached","clicks and earnings are ingested"]'::jsonb, 8, '{"agent_monitored":true}'::jsonb),
  ('codex_agent_account', 'Codex Agent Account', 'access', 'planned', 'not_started', 'not_applicable', 'unverified', 'openai', null, '["rmf_control_agent_identities"]'::jsonb, '["dedicated identity is linked","authorized feature access is verified","no owner credentials are copied"]'::jsonb, 9, '{"agent_monitored":true}'::jsonb),
  ('full_feature_access', 'Full Authorized Feature Access', 'access', 'building', 'partial', 'not_applicable', 'partial', 'database', null, '["rmf_control_agent_identities","rmf_control_features"]'::jsonb, '["every feature has an explicit entitlement","access checks have receipts"]'::jsonb, 10, '{"agent_monitored":true}'::jsonb),
  ('automatic_gpt_creator', 'Automatic GPT Creator', 'gpt_factory', 'building', 'partial', 'planned', 'partial', 'openai', null, '["rmf_control_gpt_specs","rmf_control_gpt_jobs"]'::jsonb, '["non-protected GPT jobs are queued and verified","Rate My Face GPT is always rejected"]'::jsonb, 11, '{"agent_monitored":true,"protected_gpt_excluded":"rate_my_face"}'::jsonb),
  ('vercel_business_dashboard', 'Vercel Business Dashboard', 'analytics', 'building', 'partial', 'measuring', 'partial', 'vercel', '/operator/dashboard', '["rmf_control_features","rmf_control_metric_snapshots"]'::jsonb, '["feature state is visible","money and infrastructure ledgers remain separate","unavailable data is not reported as zero"]'::jsonb, 12, '{"agent_monitored":true}'::jsonb),
  ('feature_monitor_adder', 'Feature Monitor and Adder', 'agent', 'building', 'authorized', 'not_applicable', 'partial', 'database', '/api/operator/control/features', '["rmf_control_features","rmf_control_feature_evidence"]'::jsonb, '["authorized features can be registered","production receipts update evidence","activity alone never marks completion"]'::jsonb, 13, '{"agent_monitored":true}'::jsonb),
  ('monetary_intelligence', 'Monetary Intelligence', 'money', 'building', 'partial', 'measuring', 'partial', 'database', null, '["rmf_control_metric_snapshots","rmf_credit_ledger","rmf_stripe_events"]'::jsonb, '["revenue, product credits, agent compute, and infrastructure cost stay separate","funnel evidence is timestamped"]'::jsonb, 14, '{"agent_monitored":true}'::jsonb)
on conflict (feature_key) do nothing;

insert into public.rmf_control_agent_identities (
  agent_key, display_name, role, status, feature_access, entitlements, metadata
) values (
  'codex',
  'Codex unified operator',
  'feature_agent',
  'provisioning_required',
  'scoped',
  '[]'::jsonb,
  '{"credential_policy":"supported_sign_in_only","owner_credentials_copyable":false}'::jsonb
)
on conflict (agent_key) do nothing;

insert into public.rmf_control_gpt_specs (
  gpt_key, name, protected, creator_mode, factory_enabled, status,
  instruction_hash, agent_generated_configuration
) values (
  'rate_my_face',
  'Rate My Face GPT',
  true,
  'human_only',
  false,
  'protected',
  'b561dd48b11dfc052601a1ce1ca53aff1961fa74f7e3c8749a5c487931cf47dc',
  '{}'::jsonb
)
on conflict (gpt_key) do nothing;
