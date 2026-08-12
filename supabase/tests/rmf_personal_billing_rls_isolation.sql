-- Manual / CI-adjacent verification script for personal+billing RLS isolation.
-- Apply after 20260812153000_enable_rmf_personal_billing_rls.sql.
--
-- Usage (local harness or Supabase SQL editor with care):
--   1. Ensure anon + authenticated roles exist (Supabase has them).
--   2. Seed two users, then run the SELECTs below under each role.
--
-- Expected:
--   authenticated + sub=UserA → own rows only
--   authenticated + sub=UserA → UserB rows empty
--   anon → permission denied
--   postgres/table owner → full read/write (Account Learning + credits)

-- Example seed (server role):
-- insert into rmf_users (id) values
--   ('11111111-1111-4111-8111-111111111111'),
--   ('22222222-2222-4222-8222-222222222222');
-- insert into rmf_personal_profiles (user_id, profile) values
--   ('11111111-1111-4111-8111-111111111111', '{"preferences":{"look":"a"}}'),
--   ('22222222-2222-4222-8222-222222222222', '{"preferences":{"look":"b"}}');
-- insert into rmf_credit_accounts (user_id, balance) values
--   ('11111111-1111-4111-8111-111111111111', 100),
--   ('22222222-2222-4222-8222-222222222222', 200);

-- As authenticated User A:
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
--   select user_id from rmf_personal_profiles;           -- expect only User A
--   select user_id, balance from rmf_credit_accounts;    -- expect only User A
--   select * from rmf_stripe_events;                     -- expect permission denied
--   update rmf_credit_accounts set balance = 999;        -- expect permission denied
-- rollback;

-- As anon:
-- begin;
--   set local role anon;
--   select * from rmf_personal_profiles;                 -- expect permission denied
--   select * from rmf_credit_accounts;                   -- expect permission denied
-- rollback;

select 'see comments in supabase/tests/rmf_personal_billing_rls_isolation.sql' as how_to_verify;
