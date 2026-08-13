-- Personal Intelligence Suite: outcome-aware products, authorized social
-- evidence, reference comparisons, and bounded personal-agent receipts.
--
-- Trust model:
--   - Vercel server routes write through POSTGRES_URL / DATABASE_URL.
--   - Authenticated Data API clients may SELECT only their own rows.
--   - Anonymous access and authenticated Data API writes are denied.
--   - Do NOT FORCE RLS: the trusted postgres server path must retain writes.
--
-- Evidence closure remains explicit. Sparse observations never become a
-- directional conclusion, and agent writes require a separately recorded
-- approval and receipt.
--
-- Idempotent: safe to re-run.

create unique index if not exists rmf_personal_recommendations_id_user_unique_idx
  on public.rmf_personal_recommendations(id, user_id);

create table if not exists public.rmf_product_outcomes (
  id bigserial primary key,
  recommendation_id bigint not null,
  user_id text not null,
  score smallint not null check (score >= 1 and score <= 5),
  note text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rmf_product_outcomes_recommendation_user_fk
    foreign key (recommendation_id, user_id)
    references public.rmf_personal_recommendations(id, user_id)
    on delete cascade
);

create table if not exists public.rmf_social_outcomes (
  id bigserial primary key,
  user_id text not null,
  provider text not null
    check (provider in ('instagram', 'linkedin', 'tiktok')),
  metric_label text not null check (length(btrim(metric_label)) > 0),
  metric_value numeric not null
    check (metric_value >= -1000000000000 and metric_value <= 1000000000000),
  context_label text,
  source_kind text not null default 'user_recorded'
    check (source_kind in ('user_recorded', 'provider_authorized')),
  external_ref_hash text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.rmf_reference_comparisons (
  id bigserial primary key,
  user_id text not null,
  title text not null check (length(btrim(title)) > 0),
  reference_label text not null check (length(btrim(reference_label)) > 0),
  metric_label text not null check (length(btrim(metric_label)) > 0),
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  minimum_pairs smallint not null default 2
    check (minimum_pairs >= 1 and minimum_pairs <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint rmf_reference_comparisons_id_user_unique unique (id, user_id)
);

create table if not exists public.rmf_reference_observations (
  id bigserial primary key,
  comparison_id bigint not null,
  user_id text not null,
  self_score smallint not null check (self_score >= 1 and self_score <= 5),
  reference_score smallint not null check (reference_score >= 1 and reference_score <= 5),
  note text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rmf_reference_observations_comparison_user_fk
    foreign key (comparison_id, user_id)
    references public.rmf_reference_comparisons(id, user_id)
    on delete cascade
);

create table if not exists public.rmf_personal_agent_runs (
  id bigserial primary key,
  user_id text not null,
  goal text not null check (length(btrim(goal)) > 0),
  status text not null default 'running'
    check (status in ('running', 'awaiting_approval', 'approved', 'completed', 'rejected', 'cancelled')),
  authority smallint not null default 0 check (authority >= 0 and authority <= 1),
  closure_state text not null default 'open'
    check (closure_state in ('open', 'evidence_found', 'insufficient', 'approved', 'rejected', 'completed')),
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint rmf_personal_agent_runs_id_user_unique unique (id, user_id)
);

create table if not exists public.rmf_personal_agent_actions (
  id bigserial primary key,
  run_id bigint not null,
  user_id text not null,
  action_type text not null
    check (action_type in (
      'ask_history',
      'record_product_outcome',
      'record_social_outcome',
      'start_reference_comparison',
      'start_personal_experiment'
    )),
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'completed', 'rejected')),
  requires_approval boolean not null default true,
  rationale text not null,
  payload jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rmf_personal_agent_actions_run_user_fk
    foreign key (run_id, user_id)
    references public.rmf_personal_agent_runs(id, user_id)
    on delete cascade,
  constraint rmf_personal_agent_actions_id_user_unique unique (id, user_id)
);

create table if not exists public.rmf_personal_agent_receipts (
  id bigserial primary key,
  run_id bigint not null,
  action_id bigint not null,
  user_id text not null,
  receipt_type text not null
    check (receipt_type in ('read', 'approval', 'completion')),
  expected jsonb not null default '{}'::jsonb,
  observed jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint rmf_personal_agent_receipts_run_user_fk
    foreign key (run_id, user_id)
    references public.rmf_personal_agent_runs(id, user_id)
    on delete cascade,
  constraint rmf_personal_agent_receipts_action_user_fk
    foreign key (action_id, user_id)
    references public.rmf_personal_agent_actions(id, user_id)
    on delete cascade
);

create index if not exists rmf_product_outcomes_recommendation_user_idx
  on public.rmf_product_outcomes(recommendation_id, user_id);
create index if not exists rmf_product_outcomes_user_observed_idx
  on public.rmf_product_outcomes(user_id, observed_at desc);
create index if not exists rmf_social_outcomes_user_metric_observed_idx
  on public.rmf_social_outcomes(user_id, provider, metric_label, observed_at);
create index if not exists rmf_reference_comparisons_user_updated_idx
  on public.rmf_reference_comparisons(user_id, updated_at desc);
create index if not exists rmf_reference_observations_comparison_user_idx
  on public.rmf_reference_observations(comparison_id, user_id);
create index if not exists rmf_reference_observations_user_observed_idx
  on public.rmf_reference_observations(user_id, observed_at desc);
create index if not exists rmf_personal_agent_runs_user_updated_idx
  on public.rmf_personal_agent_runs(user_id, updated_at desc);
create index if not exists rmf_personal_agent_actions_run_user_idx
  on public.rmf_personal_agent_actions(run_id, user_id);
create index if not exists rmf_personal_agent_actions_id_user_idx
  on public.rmf_personal_agent_actions(id, user_id);
create index if not exists rmf_personal_agent_receipts_run_user_idx
  on public.rmf_personal_agent_receipts(run_id, user_id);
create index if not exists rmf_personal_agent_receipts_action_user_idx
  on public.rmf_personal_agent_receipts(action_id, user_id);

alter table public.rmf_product_outcomes enable row level security;
alter table public.rmf_social_outcomes enable row level security;
alter table public.rmf_reference_comparisons enable row level security;
alter table public.rmf_reference_observations enable row level security;
alter table public.rmf_personal_agent_runs enable row level security;
alter table public.rmf_personal_agent_actions enable row level security;
alter table public.rmf_personal_agent_receipts enable row level security;

drop policy if exists rmf_product_outcomes_select_own on public.rmf_product_outcomes;
drop policy if exists rmf_social_outcomes_select_own on public.rmf_social_outcomes;
drop policy if exists rmf_reference_comparisons_select_own on public.rmf_reference_comparisons;
drop policy if exists rmf_reference_observations_select_own on public.rmf_reference_observations;
drop policy if exists rmf_personal_agent_runs_select_own on public.rmf_personal_agent_runs;
drop policy if exists rmf_personal_agent_actions_select_own on public.rmf_personal_agent_actions;
drop policy if exists rmf_personal_agent_receipts_select_own on public.rmf_personal_agent_receipts;

create policy rmf_product_outcomes_select_own
  on public.rmf_product_outcomes for select to authenticated
  using (user_id = ((select auth.uid())::text));
create policy rmf_social_outcomes_select_own
  on public.rmf_social_outcomes for select to authenticated
  using (user_id = ((select auth.uid())::text));
create policy rmf_reference_comparisons_select_own
  on public.rmf_reference_comparisons for select to authenticated
  using (user_id = ((select auth.uid())::text));
create policy rmf_reference_observations_select_own
  on public.rmf_reference_observations for select to authenticated
  using (user_id = ((select auth.uid())::text));
create policy rmf_personal_agent_runs_select_own
  on public.rmf_personal_agent_runs for select to authenticated
  using (user_id = ((select auth.uid())::text));
create policy rmf_personal_agent_actions_select_own
  on public.rmf_personal_agent_actions for select to authenticated
  using (user_id = ((select auth.uid())::text));
create policy rmf_personal_agent_receipts_select_own
  on public.rmf_personal_agent_receipts for select to authenticated
  using (user_id = ((select auth.uid())::text));

revoke all on table public.rmf_product_outcomes from anon, authenticated;
revoke all on table public.rmf_social_outcomes from anon, authenticated;
revoke all on table public.rmf_reference_comparisons from anon, authenticated;
revoke all on table public.rmf_reference_observations from anon, authenticated;
revoke all on table public.rmf_personal_agent_runs from anon, authenticated;
revoke all on table public.rmf_personal_agent_actions from anon, authenticated;
revoke all on table public.rmf_personal_agent_receipts from anon, authenticated;

grant select on table public.rmf_product_outcomes to authenticated;
grant select on table public.rmf_social_outcomes to authenticated;
grant select on table public.rmf_reference_comparisons to authenticated;
grant select on table public.rmf_reference_observations to authenticated;
grant select on table public.rmf_personal_agent_runs to authenticated;
grant select on table public.rmf_personal_agent_actions to authenticated;
grant select on table public.rmf_personal_agent_receipts to authenticated;
