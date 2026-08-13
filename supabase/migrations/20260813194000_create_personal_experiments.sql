-- Personal Experiments: user-defined A/B evidence with explicit closure states.
--
-- Trust model:
--   - Vercel server routes write through POSTGRES_URL / DATABASE_URL.
--   - Authenticated Data API clients may SELECT only their own rows.
--   - Anonymous access and authenticated Data API writes are denied.
--   - Do NOT FORCE RLS: the trusted postgres server path must retain writes.
--
-- The two presentations remain distinct. The application reports one of:
-- insufficient, tied, favors_a, favors_b. A completed experiment may still
-- be insufficient or tied; completion never manufactures a conclusion.
--
-- Idempotent: safe to re-run.

create table if not exists public.rmf_personal_experiments (
  id bigserial primary key,
  user_id text not null,
  title text not null check (length(btrim(title)) > 0),
  option_a_label text not null check (length(btrim(option_a_label)) > 0),
  option_b_label text not null check (length(btrim(option_b_label)) > 0),
  metric_label text not null default 'personal outcome'
    check (length(btrim(metric_label)) > 0),
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  minimum_per_option smallint not null default 2
    check (minimum_per_option >= 1 and minimum_per_option <= 10),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint rmf_personal_experiments_distinct_options
    check (lower(btrim(option_a_label)) <> lower(btrim(option_b_label))),
  constraint rmf_personal_experiments_id_user_unique unique (id, user_id)
);

create table if not exists public.rmf_personal_experiment_outcomes (
  id bigserial primary key,
  experiment_id bigint not null,
  user_id text not null,
  option_key text not null check (option_key in ('a', 'b')),
  score smallint not null check (score >= 1 and score <= 5),
  note text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rmf_personal_experiment_outcomes_experiment_user_fk
    foreign key (experiment_id, user_id)
    references public.rmf_personal_experiments(id, user_id)
    on delete cascade
);

create index if not exists rmf_personal_experiments_user_updated_idx
  on public.rmf_personal_experiments(user_id, updated_at desc);

create index if not exists rmf_personal_experiments_user_status_idx
  on public.rmf_personal_experiments(user_id, status, updated_at desc);

create index if not exists rmf_personal_experiment_outcomes_experiment_observed_idx
  on public.rmf_personal_experiment_outcomes(experiment_id, observed_at, id);

create index if not exists rmf_personal_experiment_outcomes_user_observed_idx
  on public.rmf_personal_experiment_outcomes(user_id, observed_at desc);

alter table public.rmf_personal_experiments enable row level security;
alter table public.rmf_personal_experiment_outcomes enable row level security;

drop policy if exists rmf_personal_experiments_select_own
  on public.rmf_personal_experiments;
drop policy if exists rmf_personal_experiment_outcomes_select_own
  on public.rmf_personal_experiment_outcomes;

create policy rmf_personal_experiments_select_own
  on public.rmf_personal_experiments
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

create policy rmf_personal_experiment_outcomes_select_own
  on public.rmf_personal_experiment_outcomes
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

revoke all on table public.rmf_personal_experiments from anon, authenticated;
revoke all on table public.rmf_personal_experiment_outcomes from anon, authenticated;

grant select on table public.rmf_personal_experiments to authenticated;
grant select on table public.rmf_personal_experiment_outcomes to authenticated;
