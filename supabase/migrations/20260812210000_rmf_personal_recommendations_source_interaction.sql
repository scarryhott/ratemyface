-- Account Learning production pipeline: link personal recommendations
-- back to the interaction that produced them.
--
-- Soft link (no FK): keep learning schema independent of interaction
-- deletes, matching rmf_compare_jobs.source_interaction_id and
-- appearance-agent soft refs.
--
-- Does NOT enable Compare Me To Me, Social, or Appearance Agent.
-- RLS policies on rmf_personal_recommendations are unchanged
-- (server writes; anon deny; authenticated own-row SELECT).
--
-- Idempotent: safe to re-run.

alter table public.rmf_personal_recommendations
  add column if not exists source_interaction_id bigint;

create index if not exists rmf_personal_recommendations_source_interaction_idx
  on public.rmf_personal_recommendations(source_interaction_id)
  where source_interaction_id is not null;

create index if not exists rmf_personal_recommendations_user_url_idx
  on public.rmf_personal_recommendations(user_id, url)
  where url is not null;
