-- Compare Me To Me data path foundations (DISABLED for users).
--
-- Feature flag stays off in app code (lib/compareFeature.ts + /api/health).
-- This migration only creates schema + RLS so operator/ops can see empty
-- job tables. Do NOT wire product UI or flip LIVE here.
--
-- Trust model (same as 20260812153000 personal/billing RLS):
--   - Server path uses POSTGRES_URL / DATABASE_URL as the postgres role via
--     the `postgres` npm client. Table owners / superusers bypass RLS unless
--     FORCE ROW LEVEL SECURITY is set. Do NOT enable FORCE — that would break
--     Account Learning, Stripe credits, and operator dashboard server routes.
--   - Browser / ChatGPT never query these tables through the Supabase Data API.
--   - Own-row SELECT for authenticated (auth.uid()::text) is defense-in-depth.
--     Writes stay server-only so jobs cannot be forged via PostgREST.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table if not exists public.rmf_compare_jobs (
  id bigserial primary key,
  user_id text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  -- Soft link to persisted Account Learning interaction (no FK: keep learning
  -- schema independent; interaction may be deleted without blocking jobs).
  source_interaction_id bigint,
  before_image_ref text,
  after_image_ref text,
  consent_compare boolean not null default false,
  consent_image_storage boolean not null default false,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.rmf_compare_results (
  id bigserial primary key,
  job_id bigint not null references public.rmf_compare_jobs(id) on delete cascade,
  user_id text not null,
  summary text,
  score jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rmf_compare_jobs_user_created_idx
  on public.rmf_compare_jobs(user_id, created_at desc);

create index if not exists rmf_compare_jobs_status_idx
  on public.rmf_compare_jobs(status, created_at desc);

create index if not exists rmf_compare_results_user_created_idx
  on public.rmf_compare_results(user_id, created_at desc);

create index if not exists rmf_compare_results_job_idx
  on public.rmf_compare_results(job_id);

-- ---------------------------------------------------------------------------
-- Enable RLS (no FORCE — postgres server role must keep working)
-- ---------------------------------------------------------------------------

alter table public.rmf_compare_jobs enable row level security;
alter table public.rmf_compare_results enable row level security;

-- ---------------------------------------------------------------------------
-- Drop prior policies (idempotent re-apply)
-- ---------------------------------------------------------------------------

drop policy if exists rmf_compare_jobs_select_own on public.rmf_compare_jobs;
drop policy if exists rmf_compare_results_select_own on public.rmf_compare_results;

-- ---------------------------------------------------------------------------
-- Own-row SELECT for authenticated. No INSERT/UPDATE/DELETE policies →
-- Data API writes denied (server postgres only).
-- ---------------------------------------------------------------------------

create policy rmf_compare_jobs_select_own
  on public.rmf_compare_jobs
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_compare_results_select_own
  on public.rmf_compare_results
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

-- ---------------------------------------------------------------------------
-- Privileges: anon denied; authenticated SELECT only (policies filter rows);
-- writes remain with table owner / server postgres role.
-- ---------------------------------------------------------------------------

revoke all on table public.rmf_compare_jobs from anon, authenticated;
revoke all on table public.rmf_compare_results from anon, authenticated;

grant select on table public.rmf_compare_jobs to authenticated;
grant select on table public.rmf_compare_results to authenticated;
