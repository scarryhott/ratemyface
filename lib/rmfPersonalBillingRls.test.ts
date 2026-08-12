/**
 * Structural + (optional) live isolation proofs for personal/billing RLS.
 *
 * Always runs: asserts migration SQL encodes the policy matrix.
 * With DATABASE_URL / POSTGRES_URL / RMF_RLS_TEST_DATABASE_URL: applies a
 * local harness (mock auth.uid, anon/authenticated roles) and proves:
 *   1) User A SELECT own → ALLOW
 *   2) User A SELECT User B → DENY (empty)
 *   3) anon → DENY / privilege failure
 *   4) table-owner / server role → ALLOW reads+writes
 *
 * Run: npm run test:rls
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260812153000_enable_rmf_personal_billing_rls.sql"
);

const USER_SCOPED_TABLES = [
  "rmf_users",
  "rmf_user_context",
  "rmf_conversation_summaries",
  "rmf_recommendations",
  "rmf_billing_accounts",
  "rmf_entitlements",
  "rmf_credit_accounts",
  "rmf_credit_ledger",
  "rmf_personal_profiles",
  "rmf_interactions",
  "rmf_personal_recommendations",
  "rmf_provider_connections"
] as const;

const SERVICE_ROLE_ONLY = ["rmf_stripe_events"] as const;

const ALL_TABLES = [...USER_SCOPED_TABLES, ...SERVICE_ROLE_ONLY] as const;

function migrationSql(): string {
  return readFileSync(MIGRATION, "utf8");
}

function testDatabaseUrl(): string | null {
  // Never default to production POSTGRES_URL/DATABASE_URL — live isolation seeds/deletes rows.
  const explicit = process.env.RMF_RLS_TEST_DATABASE_URL;
  if (explicit) return explicit;
  const fallback = process.env.POSTGRES_URL || process.env.DATABASE_URL || null;
  if (!fallback) return null;
  if (/localhost|127\.0\.0\.1/.test(fallback)) return fallback;
  return null;
}

describe("rmf personal/billing RLS migration (policy matrix)", () => {
  const sqlText = migrationSql();

  it("does not FORCE row level security (server postgres must keep working)", () => {
    assert.equal(/\balter\s+table\b[\s\S]*?\bforce\s+row\s+level\s+security\b/i.test(sqlText), false);
  });

  it("enables RLS on every personal/billing table", () => {
    for (const table of ALL_TABLES) {
      assert.match(
        sqlText,
        new RegExp(`alter table public\\.${table} enable row level security;`, "i"),
        `missing ENABLE RLS for ${table}`
      );
    }
  });

  it("creates own-row SELECT policies for authenticated on user-scoped tables", () => {
    for (const table of USER_SCOPED_TABLES) {
      assert.match(
        sqlText,
        new RegExp(
          `create policy ${table}_select_own[\\s\\S]*?to authenticated[\\s\\S]*?auth\\.uid\\(\\)::text`,
          "i"
        ),
        `missing own-row SELECT policy for ${table}`
      );
    }
  });

  it("does not create write policies for authenticated (credit metering stays server-side)", () => {
    assert.equal(/\bfor insert\b/i.test(sqlText), false);
    assert.equal(/\bfor update\b/i.test(sqlText), false);
    assert.equal(/\bfor delete\b/i.test(sqlText), false);
    assert.equal(/\bfor all\b/i.test(sqlText), false);
  });

  it("keeps rmf_stripe_events service-role-only (no authenticated grant/policy)", () => {
    assert.equal(/rmf_stripe_events_select_own/i.test(sqlText), false);
    assert.equal(
      /grant select on table public\.rmf_stripe_events to authenticated/i.test(sqlText),
      false
    );
  });

  it("revokes Data API privileges from anon and authenticated, then grants SELECT only where intended", () => {
    for (const table of ALL_TABLES) {
      assert.match(
        sqlText,
        new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`, "i"),
        `missing REVOKE for ${table}`
      );
    }
    for (const table of USER_SCOPED_TABLES) {
      assert.match(
        sqlText,
        new RegExp(`grant select on table public\\.${table} to authenticated;`, "i"),
        `missing GRANT SELECT for ${table}`
      );
    }
  });

  it("documents the POSTGRES_URL / no-FORCE trust model in the header", () => {
    assert.match(sqlText, /POSTGRES_URL/);
    assert.match(sqlText, /Do NOT enable FORCE/i);
    assert.match(sqlText, /grantCredits|consumeCredits|Account Learning/i);
  });

  it("locks future compare/learning tables only if they already exist (does not create them)", () => {
    assert.match(sqlText, /rmf_learning_events/);
    assert.match(sqlText, /rmf_compare_jobs/);
    assert.match(sqlText, /Do NOT create Compare Me To Me/i);
    assert.equal(/create table if not exists public\.rmf_compare_/i.test(sqlText), false);
  });
});

describe("rmf personal/billing RLS live isolation", { skip: !testDatabaseUrl() }, () => {
  const USER_A = "11111111-1111-4111-8111-111111111111";
  const USER_B = "22222222-2222-4222-8222-222222222222";

  it("proves A-own ALLOW, A→B DENY, anon DENY, server ALLOW", async () => {
    const url = testDatabaseUrl();
    assert.ok(url);
    const local = /localhost|127\.0\.0\.1/.test(url);
    const sql = postgres(url, {
      max: 1,
      ssl: local ? false : "require",
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15
    });

    try {
      await sql.unsafe(`
        do $$ begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then
            create role anon nologin;
          end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then
            create role authenticated nologin;
          end if;
        end $$;
        grant anon to current_user;
        grant authenticated to current_user;
        create schema if not exists auth;
        grant usage on schema auth to anon, authenticated;
        create or replace function auth.uid()
        returns uuid
        language sql
        stable
        as $f$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $f$;
        grant execute on function auth.uid() to anon, authenticated;
      `);

      await sql.unsafe(migrationSql());

      await sql.begin(async (tx) => {
        await tx`delete from rmf_credit_ledger where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_credit_accounts where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_entitlements where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_billing_accounts where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_provider_connections where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_personal_recommendations where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_interactions where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_personal_profiles where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_recommendations where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_conversation_summaries where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_user_context where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_users where id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_stripe_events where event_id like 'rls_test_%'`;

        await tx`
          insert into rmf_users (id, consent_personalization) values
            (${USER_A}, true), (${USER_B}, true)
        `;
        await tx`
          insert into rmf_user_context (user_id, context) values
            (${USER_A}, '{"look":"a"}'::jsonb),
            (${USER_B}, '{"look":"b"}'::jsonb)
        `;
        await tx`
          insert into rmf_personal_profiles (user_id, profile) values
            (${USER_A}, '{"preferences":{"look":"a"}}'::jsonb),
            (${USER_B}, '{"preferences":{"look":"b"}}'::jsonb)
        `;
        await tx`
          insert into rmf_interactions (user_id, kind, summary) values
            (${USER_A}, 'note', 'a'), (${USER_B}, 'note', 'b')
        `;
        await tx`
          insert into rmf_provider_connections (user_id, provider, status) values
            (${USER_A}, 'instagram', 'planned'),
            (${USER_B}, 'instagram', 'planned')
        `;
        await tx`
          insert into rmf_credit_accounts (user_id, balance) values
            (${USER_A}, 100), (${USER_B}, 200)
        `;
        await tx`
          insert into rmf_credit_ledger (user_id, delta, balance_after, reason, external_ref) values
            (${USER_A}, 100, 100, 'signup_grant', ${`rls_test_a_${Date.now()}`}),
            (${USER_B}, 200, 200, 'signup_grant', ${`rls_test_b_${Date.now()}`})
        `;
        await tx`
          insert into rmf_entitlements (user_id, feature, active) values
            (${USER_A}, 'premium', false), (${USER_B}, 'premium', true)
        `;
        await tx`
          insert into rmf_billing_accounts (user_id, stripe_customer_id) values
            (${USER_A}, ${`cus_rls_a_${Date.now()}`}), (${USER_B}, ${`cus_rls_b_${Date.now()}`})
        `;
        await tx`
          insert into rmf_stripe_events (event_id, event_type)
          values (${`rls_test_evt_${Date.now()}`}, 'checkout.session.completed')
        `;

        // (4) Server / table-owner path: reads + writes still work.
        const serverCredits = await tx`select balance from rmf_credit_accounts where user_id = ${USER_A}`;
        assert.equal(Number(serverCredits[0].balance), 100);
        await tx`
          update rmf_credit_accounts set balance = balance + 1, updated_at = now()
          where user_id = ${USER_A}
        `;
        const serverAfter = await tx`select balance from rmf_credit_accounts where user_id = ${USER_A}`;
        assert.equal(Number(serverAfter[0].balance), 101);

        // (1)(2) Authenticated as User A.
        await tx.unsafe(`set local role authenticated`);
        await tx.unsafe(`select set_config('request.jwt.claim.sub', '${USER_A}', true)`);

        const ownProfile = await tx`select user_id from rmf_personal_profiles where user_id = ${USER_A}`;
        assert.equal(ownProfile.length, 1, "User A should read own profile");

        const otherProfile = await tx`select user_id from rmf_personal_profiles where user_id = ${USER_B}`;
        assert.equal(otherProfile.length, 0, "User A must not read User B profile");

        const ownCredits = await tx`select balance from rmf_credit_accounts where user_id = ${USER_A}`;
        assert.equal(ownCredits.length, 1, "User A should read own credits");
        const otherCredits = await tx`select balance from rmf_credit_accounts where user_id = ${USER_B}`;
        assert.equal(otherCredits.length, 0, "User A must not read User B credits");

        const ownContext = await tx`select user_id from rmf_user_context where user_id = ${USER_A}`;
        assert.equal(ownContext.length, 1);
        const otherContext = await tx`select user_id from rmf_user_context where user_id = ${USER_B}`;
        assert.equal(otherContext.length, 0);

        // Writes / stripe / anon denials: assert privileges + RLS rather than
        // aborting the postgres.js transaction with expected errors.
        const writePriv = await tx.unsafe(`
          select has_table_privilege('authenticated', 'rmf_personal_profiles', 'UPDATE') as can_update,
                 has_table_privilege('authenticated', 'rmf_credit_accounts', 'INSERT') as can_insert_credits,
                 has_table_privilege('authenticated', 'rmf_stripe_events', 'SELECT') as can_select_stripe,
                 has_table_privilege('anon', 'rmf_personal_profiles', 'SELECT') as anon_profiles,
                 has_table_privilege('anon', 'rmf_credit_accounts', 'SELECT') as anon_credits
        `);
        assert.equal(writePriv[0].can_update, false, "authenticated must not UPDATE personal profiles");
        assert.equal(writePriv[0].can_insert_credits, false, "authenticated must not INSERT credits");
        assert.equal(writePriv[0].can_select_stripe, false, "authenticated must not SELECT stripe events");
        assert.equal(writePriv[0].anon_profiles, false, "anon must not SELECT personal tables");
        assert.equal(writePriv[0].anon_credits, false, "anon must not SELECT credit tables");

        // Still under authenticated + User A: unrestricted SELECT on stripe must fail closed via privileges.
        await tx.unsafe(`reset role`);
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
