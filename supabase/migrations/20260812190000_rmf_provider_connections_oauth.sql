-- Social provider OAuth connection framework (skeleton only).
--
-- Extends rmf_provider_connections (created in 20260812153000) with token
-- metadata placeholders + connected/revoked timestamps. NO live OAuth launch.
-- User-authorized OAuth only when provider credentials are wired later.
-- Never scrape. Never log raw secrets — store encrypted refs only.
--
-- Planned providers (app gate): Instagram, LinkedIn, TikTok — OAuth only.
-- Compare Me To Me stays DISABLED. Amazon path untouched.
--
-- Trust model (same as personal/billing + compare RLS):
--   - Server path uses POSTGRES_URL / DATABASE_URL as postgres (bypasses RLS
--     unless FORCE). Do NOT enable FORCE.
--   - Browser / ChatGPT never write via Data API.
--   - Own-row SELECT for authenticated (auth.uid()::text) is defense-in-depth.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table if not exists public.rmf_provider_connections (
  user_id text not null,
  provider text not null,
  status text not null default 'planned',
  scopes text[] not null default '{}',
  external_subject text,
  profile_signals jsonb not null default '{}'::jsonb,
  -- Encrypted secret ref / vault key id only — never raw access/refresh tokens.
  token_ref text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Additive columns for envs that already have the base table from 20260812153000.
alter table public.rmf_provider_connections
  add column if not exists token_ref text;
alter table public.rmf_provider_connections
  add column if not exists token_expires_at timestamptz;
alter table public.rmf_provider_connections
  add column if not exists connected_at timestamptz;
alter table public.rmf_provider_connections
  add column if not exists revoked_at timestamptz;

-- Status vocabulary for the OAuth skeleton (planned until credentials exist).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rmf_provider_connections_status_check'
      and conrelid = 'public.rmf_provider_connections'::regclass
  ) then
    alter table public.rmf_provider_connections
      add constraint rmf_provider_connections_status_check
      check (status in (
        'planned',
        'not_configured',
        'pending',
        'connected',
        'revoked',
        'error'
      ));
  end if;
end $$;

create index if not exists rmf_provider_connections_status_idx
  on public.rmf_provider_connections(status, updated_at desc);

create index if not exists rmf_provider_connections_provider_idx
  on public.rmf_provider_connections(provider, status);

-- ---------------------------------------------------------------------------
-- Enable RLS (no FORCE — postgres server role must keep working)
-- ---------------------------------------------------------------------------

alter table public.rmf_provider_connections enable row level security;

-- ---------------------------------------------------------------------------
-- Drop prior policies (idempotent re-apply)
-- ---------------------------------------------------------------------------

drop policy if exists rmf_provider_connections_select_own on public.rmf_provider_connections;

-- ---------------------------------------------------------------------------
-- Own-row SELECT for authenticated. No INSERT/UPDATE/DELETE policies →
-- Data API writes denied (server postgres only).
-- ---------------------------------------------------------------------------

create policy rmf_provider_connections_select_own
  on public.rmf_provider_connections
  for select
  to authenticated
  using (user_id = (select auth.uid()::text));

-- ---------------------------------------------------------------------------
-- Privileges: anon denied; authenticated SELECT only (policies filter rows);
-- writes remain with table owner / server postgres role.
-- ---------------------------------------------------------------------------

revoke all on table public.rmf_provider_connections from anon, authenticated;
grant select on table public.rmf_provider_connections to authenticated;
