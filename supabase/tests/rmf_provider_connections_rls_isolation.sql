-- Manual verification for social provider connections RLS isolation.
-- Apply after 20260812190000_rmf_provider_connections_oauth.sql.
--
-- Expected:
--   authenticated + sub=UserA → own rows only
--   authenticated + sub=UserA → UserB rows empty
--   anon → permission denied
--   postgres/table owner → full read/write
--   App health: social_providers.enabled true only when a provider's secrets exist; scraping=false
--   Instagram/LinkedIn connect: POST /api/providers/connect → 501 not_configured
--   TikTok connect: authorize URL when TIKTOK_OAUTH_CLIENT_KEY + TIKTOK_OAUTH_CLIENT_SECRET are set

-- Example seed (server role):
-- insert into rmf_provider_connections (user_id, provider, status, token_ref) values
--   ('11111111-1111-4111-8111-111111111111', 'instagram', 'planned', 'vault://a'),
--   ('22222222-2222-4222-8222-222222222222', 'instagram', 'planned', 'vault://b');

-- As authenticated User A:
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
--   select user_id, provider, status from rmf_provider_connections; -- expect only User A
--   insert into rmf_provider_connections (user_id, provider) values   -- expect permission denied
--     ('11111111-1111-4111-8111-111111111111', 'linkedin');
-- rollback;

-- As anon:
-- begin;
--   set local role anon;
--   select * from rmf_provider_connections; -- expect permission denied
-- rollback;

select 'see comments in supabase/tests/rmf_provider_connections_rls_isolation.sql' as how_to_verify;
