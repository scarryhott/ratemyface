-- Advisor-driven optimization for Personal Experiments.
--
-- 1. Cover the composite (experiment_id, user_id) foreign key exactly.
-- 2. Keep auth.uid() in an init-plan subquery, with the text cast outside it,
--    so the value is evaluated once per statement rather than once per row.
--
-- Idempotent: safe to re-run.

create index if not exists rmf_personal_experiment_outcomes_experiment_user_idx
  on public.rmf_personal_experiment_outcomes(experiment_id, user_id);

drop policy if exists rmf_personal_experiments_select_own
  on public.rmf_personal_experiments;
drop policy if exists rmf_personal_experiment_outcomes_select_own
  on public.rmf_personal_experiment_outcomes;

create policy rmf_personal_experiments_select_own
  on public.rmf_personal_experiments
  for select
  to authenticated
  using (user_id = ((select auth.uid())::text));

create policy rmf_personal_experiment_outcomes_select_own
  on public.rmf_personal_experiment_outcomes
  for select
  to authenticated
  using (user_id = ((select auth.uid())::text));
