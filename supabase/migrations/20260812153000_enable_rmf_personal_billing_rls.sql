-- RLS for RMF personal / account / billing tables.
--
-- Trust model (matches lib/db.ts + Next.js Actions):
--   - Server path uses POSTGRES_URL / DATABASE_URL as the postgres role via
--     the `postgres` npm client. Table owners / superusers bypass RLS unless
--     FORCE ROW LEVEL SECURITY is set. Do NOT enable FORCE — that would break
--     Account Learning dual-write, Stripe grantCredits/consumeCredits, and
--     owner-session operator dashboard server routes.
--   - Browser / ChatGPT never query these tables through the Supabase Data API.
--     Anon + authenticated PostgREST roles must be locked down.
--   - User ids are Supabase Auth UUIDs (see /api/oauth/approve). Own-row
--     SELECT policies use auth.uid()::text for defense-in-depth if a JWT ever
--     hits PostgREST. Writes stay server-only so credit metering cannot be
--     bypassed by direct Data API inserts/updates.
--
-- Idempotent: safe to re-run. Creates missing tables (app also uses
-- CREATE TABLE IF NOT EXISTS at runtime) then enables RLS + policies.

-- ---------------------------------------------------------------------------
-- Schema (mirror of ensureMemorySchema / ensureBillingSchema /
-- ensurePersonalNetworkSchema). Kept here so greenfield envs can apply RLS.
-- ---------------------------------------------------------------------------

create table if not exists public.rmf_users (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consent_personalization boolean not null default false,
  consent_history boolean not null default false
);

create table if not exists public.rmf_user_context (
  user_id text primary key references public.rmf_users(id) on delete cascade,
  context jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.rmf_conversation_summaries (
  id bigserial primary key,
  user_id text not null references public.rmf_users(id) on delete cascade,
  summary text not null,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rmf_recommendations (
  id bigserial primary key,
  user_id text not null references public.rmf_users(id) on delete cascade,
  asin text,
  title text,
  affiliate_url text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rmf_billing_accounts (
  user_id text primary key,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text,
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.rmf_entitlements (
  user_id text not null,
  feature text not null,
  active boolean not null default false,
  source text not null default 'stripe',
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);

create table if not exists public.rmf_stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.rmf_credit_accounts (
  user_id text primary key,
  balance bigint not null default 0 check (balance >= 0),
  lifetime_purchased bigint not null default 0,
  lifetime_spent bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.rmf_credit_ledger (
  id bigserial primary key,
  user_id text not null,
  delta bigint not null,
  balance_after bigint not null,
  reason text not null,
  action text,
  external_ref text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rmf_personal_profiles (
  user_id text primary key,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.rmf_interactions (
  id bigserial primary key,
  user_id text not null,
  kind text not null,
  summary text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rmf_personal_recommendations (
  id bigserial primary key,
  user_id text not null,
  item_type text not null default 'product',
  title text,
  url text,
  data jsonb not null default '{}'::jsonb,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rmf_provider_connections (
  user_id text not null,
  provider text not null,
  status text not null default 'planned',
  scopes text[] not null default '{}',
  external_subject text,
  profile_signals jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create index if not exists rmf_conversation_summaries_user_created_idx
  on public.rmf_conversation_summaries(user_id, created_at desc);
create index if not exists rmf_recommendations_user_created_idx
  on public.rmf_recommendations(user_id, created_at desc);
create index if not exists rmf_billing_customer_idx
  on public.rmf_billing_accounts(stripe_customer_id);
create index if not exists rmf_billing_subscription_idx
  on public.rmf_billing_accounts(stripe_subscription_id);
create index if not exists rmf_credit_ledger_user_idx
  on public.rmf_credit_ledger(user_id, created_at desc);
create index if not exists rmf_interactions_user_idx
  on public.rmf_interactions(user_id, created_at desc);
create index if not exists rmf_personal_recommendations_user_idx
  on public.rmf_personal_recommendations(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Enable RLS (no FORCE — postgres server role must keep working)
-- ---------------------------------------------------------------------------

alter table public.rmf_users enable row level security;
alter table public.rmf_user_context enable row level security;
alter table public.rmf_conversation_summaries enable row level security;
alter table public.rmf_recommendations enable row level security;
alter table public.rmf_billing_accounts enable row level security;
alter table public.rmf_entitlements enable row level security;
alter table public.rmf_stripe_events enable row level security;
alter table public.rmf_credit_accounts enable row level security;
alter table public.rmf_credit_ledger enable row level security;
alter table public.rmf_personal_profiles enable row level security;
alter table public.rmf_interactions enable row level security;
alter table public.rmf_personal_recommendations enable row level security;
alter table public.rmf_provider_connections enable row level security;

-- ---------------------------------------------------------------------------
-- Drop prior policies (idempotent re-apply)
-- ---------------------------------------------------------------------------

drop policy if exists rmf_users_select_own on public.rmf_users;
drop policy if exists rmf_user_context_select_own on public.rmf_user_context;
drop policy if exists rmf_conversation_summaries_select_own on public.rmf_conversation_summaries;
drop policy if exists rmf_recommendations_select_own on public.rmf_recommendations;
drop policy if exists rmf_billing_accounts_select_own on public.rmf_billing_accounts;
drop policy if exists rmf_entitlements_select_own on public.rmf_entitlements;
drop policy if exists rmf_credit_accounts_select_own on public.rmf_credit_accounts;
drop policy if exists rmf_credit_ledger_select_own on public.rmf_credit_ledger;
drop policy if exists rmf_personal_profiles_select_own on public.rmf_personal_profiles;
drop policy if exists rmf_interactions_select_own on public.rmf_interactions;
drop policy if exists rmf_personal_recommendations_select_own on public.rmf_personal_recommendations;
drop policy if exists rmf_provider_connections_select_own on public.rmf_provider_connections;

-- ---------------------------------------------------------------------------
-- Own-row SELECT for authenticated (auth.uid() = Supabase user id).
-- No INSERT/UPDATE/DELETE policies → Data API writes denied.
-- rmf_stripe_events: service-role / postgres only (no user ownership column).
-- ---------------------------------------------------------------------------

create policy rmf_users_select_own
  on public.rmf_users
  for select
  to authenticated
  using (id = (select auth.uid()::text));

create policy rmf_user_context_select_own
  on public.rmf_user_context
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_conversation_summaries_select_own
  on public.rmf_conversation_summaries
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_recommendations_select_own
  on public.rmf_recommendations
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_billing_accounts_select_own
  on public.rmf_billing_accounts
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_entitlements_select_own
  on public.rmf_entitlements
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_credit_accounts_select_own
  on public.rmf_credit_accounts
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_credit_ledger_select_own
  on public.rmf_credit_ledger
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_personal_profiles_select_own
  on public.rmf_personal_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_interactions_select_own
  on public.rmf_interactions
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_personal_recommendations_select_own
  on public.rmf_personal_recommendations
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_provider_connections_select_own
  on public.rmf_provider_connections
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

-- ---------------------------------------------------------------------------
-- Privileges: anon denied; authenticated may SELECT only (policies filter rows);
-- writes remain with table owner / server postgres role.
-- ---------------------------------------------------------------------------

revoke all on table public.rmf_users from anon, authenticated;
revoke all on table public.rmf_user_context from anon, authenticated;
revoke all on table public.rmf_conversation_summaries from anon, authenticated;
revoke all on table public.rmf_recommendations from anon, authenticated;
revoke all on table public.rmf_billing_accounts from anon, authenticated;
revoke all on table public.rmf_entitlements from anon, authenticated;
revoke all on table public.rmf_stripe_events from anon, authenticated;
revoke all on table public.rmf_credit_accounts from anon, authenticated;
revoke all on table public.rmf_credit_ledger from anon, authenticated;
revoke all on table public.rmf_personal_profiles from anon, authenticated;
revoke all on table public.rmf_interactions from anon, authenticated;
revoke all on table public.rmf_personal_recommendations from anon, authenticated;
revoke all on table public.rmf_provider_connections from anon, authenticated;

grant select on table public.rmf_users to authenticated;
grant select on table public.rmf_user_context to authenticated;
grant select on table public.rmf_conversation_summaries to authenticated;
grant select on table public.rmf_recommendations to authenticated;
grant select on table public.rmf_billing_accounts to authenticated;
grant select on table public.rmf_entitlements to authenticated;
grant select on table public.rmf_credit_accounts to authenticated;
grant select on table public.rmf_credit_ledger to authenticated;
grant select on table public.rmf_personal_profiles to authenticated;
grant select on table public.rmf_interactions to authenticated;
grant select on table public.rmf_personal_recommendations to authenticated;
grant select on table public.rmf_provider_connections to authenticated;
-- rmf_stripe_events: intentionally no grant to anon/authenticated (service-role-only)
