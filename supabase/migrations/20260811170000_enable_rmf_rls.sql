-- RLS lockdown for sensitive RMF tables (applied live 2026-08-11 on
-- supabase-coquelicot-candle / clqsfnmlyobbduavetpk).
--
-- Why: OAuth tokens and agent state must never be readable via the Supabase
-- Data API with the anon/authenticated keys. The app uses DATABASE_URL
-- (postgres role) for all data I/O, which bypasses RLS unless FORCE is set.
-- Do NOT enable FORCE ROW LEVEL SECURITY — that would break the backend.
-- No permissive policies are created; empty policies = deny-by-default.

-- OAuth
alter table public.rmf_oauth_tokens enable row level security;
alter table public.rmf_oauth_codes enable row level security;

-- Operator agent
alter table public.rmf_agent_approvals enable row level security;
alter table public.rmf_agent_context enable row level security;
alter table public.rmf_agent_gpts enable row level security;
alter table public.rmf_agent_ledger enable row level security;
alter table public.rmf_agent_projects enable row level security;
alter table public.rmf_agent_receipts enable row level security;
alter table public.rmf_agent_runs enable row level security;
alter table public.rmf_agent_signals enable row level security;

-- Deny Data API access for PostgREST roles (idempotent REVOKE)
revoke all on table public.rmf_oauth_tokens from anon, authenticated;
revoke all on table public.rmf_oauth_codes from anon, authenticated;
revoke all on table public.rmf_agent_approvals from anon, authenticated;
revoke all on table public.rmf_agent_context from anon, authenticated;
revoke all on table public.rmf_agent_gpts from anon, authenticated;
revoke all on table public.rmf_agent_ledger from anon, authenticated;
revoke all on table public.rmf_agent_projects from anon, authenticated;
revoke all on table public.rmf_agent_receipts from anon, authenticated;
revoke all on table public.rmf_agent_runs from anon, authenticated;
revoke all on table public.rmf_agent_signals from anon, authenticated;
