-- Autonomous Appearance Agent data path foundations (DISABLED for users).
--
-- Feature flag stays off in app code (lib/appearanceAgent.ts + /api/health).
-- This migration only creates schema + RLS so operator/ops can see empty
-- plan/check-in tables. Do NOT wire product UI, OpenAPI Actions, or flip LIVE.
-- Not LIVE paid coaching — scaffold for 90-day professional image plans only.
--
-- Trust model (same as 20260812153000 personal/billing RLS + compare tables):
--   - Server path uses POSTGRES_URL / DATABASE_URL as the postgres role via
--     the `postgres` npm client. Table owners / superusers bypass RLS unless
--     FORCE ROW LEVEL SECURITY is set. Do NOT enable FORCE — that would break
--     Account Learning, Stripe credits, and operator dashboard server routes.
--   - Browser / ChatGPT never query these tables through the Supabase Data API.
--   - Own-row SELECT for authenticated (auth.uid()::text) is defense-in-depth.
--     Writes stay server-only so plans/check-ins cannot be forged via PostgREST.
--
-- Soft links (no FK) to Account Learning / Compare when present:
--   baseline_interaction_id → rmf_interactions
--   recommendation_id → rmf_personal_recommendations
--   compare_job_id → rmf_compare_jobs
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table if not exists public.rmf_appearance_plans (
  id bigserial primary key,
  user_id text not null,
  goal text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed')),
  -- Day index within the 90-day improve loop (0 = not started / baseline).
  day_index integer not null default 0
    check (day_index >= 0 and day_index <= 90),
  target_days integer not null default 90
    check (target_days > 0 and target_days <= 90),
  -- Soft refs: baseline image + Account Learning interaction (no FK).
  baseline_image_ref text,
  baseline_interaction_id bigint,
  baseline_profile_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.rmf_appearance_checkins (
  id bigserial primary key,
  plan_id bigint not null references public.rmf_appearance_plans(id) on delete cascade,
  user_id text not null,
  day_index integer not null
    check (day_index >= 0 and day_index <= 90),
  summary text,
  -- Soft links to personal network / interactions / compare when present.
  recommendation_id bigint,
  interaction_id bigint,
  compare_job_id bigint,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rmf_appearance_plans_user_created_idx
  on public.rmf_appearance_plans(user_id, created_at desc);

create index if not exists rmf_appearance_plans_status_idx
  on public.rmf_appearance_plans(status, created_at desc);

create index if not exists rmf_appearance_checkins_user_created_idx
  on public.rmf_appearance_checkins(user_id, created_at desc);

create index if not exists rmf_appearance_checkins_plan_day_idx
  on public.rmf_appearance_checkins(plan_id, day_index);

-- ---------------------------------------------------------------------------
-- Enable RLS (no FORCE — postgres server role must keep working)
-- ---------------------------------------------------------------------------

alter table public.rmf_appearance_plans enable row level security;
alter table public.rmf_appearance_checkins enable row level security;

-- ---------------------------------------------------------------------------
-- Drop prior policies (idempotent re-apply)
-- ---------------------------------------------------------------------------

drop policy if exists rmf_appearance_plans_select_own on public.rmf_appearance_plans;
drop policy if exists rmf_appearance_checkins_select_own on public.rmf_appearance_checkins;

-- ---------------------------------------------------------------------------
-- Own-row SELECT for authenticated. No INSERT/UPDATE/DELETE policies →
-- Data API writes denied (server postgres only).
-- ---------------------------------------------------------------------------

create policy rmf_appearance_plans_select_own
  on public.rmf_appearance_plans
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_appearance_checkins_select_own
  on public.rmf_appearance_checkins
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

-- ---------------------------------------------------------------------------
-- Privileges: anon denied; authenticated SELECT only (policies filter rows);
-- writes remain with table owner / server postgres role.
-- ---------------------------------------------------------------------------

revoke all on table public.rmf_appearance_plans from anon, authenticated;
revoke all on table public.rmf_appearance_checkins from anon, authenticated;

grant select on table public.rmf_appearance_plans to authenticated;
grant select on table public.rmf_appearance_checkins to authenticated;
