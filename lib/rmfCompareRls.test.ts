/**
 * Structural + (optional) live isolation proofs for Compare Me To Me RLS.
 *
 * Always runs: asserts migration SQL encodes the policy matrix and does not
 * enable the product feature.
 * With RMF_RLS_TEST_DATABASE_URL (or localhost POSTGRES_URL): proves own-row
 * SELECT, cross-user DENY, anon DENY, server ALLOW.
 *
 * Run: npm run test:rls
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { COMPARE_ME_TO_ME } from "./compareFeature.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260812180000_create_rmf_compare_tables.sql"
);
const HEALTH = join(__dirname, "..", "app", "api", "health", "route.ts");

const TABLES = ["rmf_compare_jobs", "rmf_compare_results"] as const;

function migrationSql(): string {
  return readFileSync(MIGRATION, "utf8");
}

function testDatabaseUrl(): string | null {
  const explicit = process.env.RMF_RLS_TEST_DATABASE_URL;
  if (explicit) return explicit;
  const fallback = process.env.POSTGRES_URL || process.env.DATABASE_URL || null;
  if (!fallback) return null;
  if (/localhost|127\.0\.0\.1/.test(fallback)) return fallback;
  return null;
}

describe("rmf compare RLS migration (policy matrix)", () => {
  const sqlText = migrationSql();

  it("creates compare jobs + results tables", () => {
    assert.match(sqlText, /create table if not exists public\.rmf_compare_jobs/i);
    assert.match(sqlText, /create table if not exists public\.rmf_compare_results/i);
    assert.match(sqlText, /status text not null default 'queued'/i);
    assert.match(sqlText, /queued.*running.*completed.*failed/i);
    assert.match(sqlText, /before_image_ref/i);
    assert.match(sqlText, /after_image_ref/i);
    assert.match(sqlText, /consent_compare/i);
    assert.match(sqlText, /consent_image_storage/i);
    assert.match(sqlText, /source_interaction_id/i);
  });

  it("does not FORCE row level security", () => {
    assert.equal(/\bforce\s+row\s+level\s+security\b/i.test(sqlText), false);
    assert.match(sqlText, /Do NOT enable FORCE/i);
  });

  it("enables RLS and own-row SELECT policies; no write policies", () => {
    for (const table of TABLES) {
      assert.match(
        sqlText,
        new RegExp(`alter table public\\.${table} enable row level security;`, "i"),
        `missing ENABLE RLS for ${table}`
      );
      assert.match(
        sqlText,
        new RegExp(
          `create policy ${table}_select_own[\\s\\S]*?to authenticated[\\s\\S]*?auth\\.uid\\(\\)::text`,
          "i"
        ),
        `missing own-row SELECT for ${table}`
      );
      assert.match(
        sqlText,
        new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`, "i")
      );
      assert.match(
        sqlText,
        new RegExp(`grant select on table public\\.${table} to authenticated;`, "i")
      );
    }
    assert.equal(/\bfor insert\b/i.test(sqlText), false);
    assert.equal(/\bfor update\b/i.test(sqlText), false);
    assert.equal(/\bfor delete\b/i.test(sqlText), false);
  });

  it("documents feature remains disabled", () => {
    assert.match(sqlText, /DISABLED for users/i);
    assert.match(sqlText, /Do NOT wire product UI|feature remains DISABLED/i);
  });
});

describe("compare feature gate stays off", () => {
  it("COMPARE_ME_TO_ME.enabled is false", () => {
    assert.equal(COMPARE_ME_TO_ME.enabled, false);
    assert.equal(COMPARE_ME_TO_ME.status, "requires_account_learning");
    assert.equal(COMPARE_ME_TO_ME.dashboard_status, "DISABLED");
  });

  it("health route still reports compare disabled", () => {
    const health = readFileSync(HEALTH, "utf8");
    assert.match(health, /compare_me_to_me/);
    assert.match(health, /enabled:\s*false/);
    assert.match(health, /requires_account_learning/);
  });
});

describe("rmf compare RLS live isolation", { skip: !testDatabaseUrl() }, () => {
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
        await tx`delete from rmf_compare_results where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_compare_jobs where user_id in (${USER_A}, ${USER_B})`;

        const jobs = await tx`
          insert into rmf_compare_jobs (user_id, status, consent_compare, before_image_ref)
          values
            (${USER_A}, 'queued', false, 'ref://a'),
            (${USER_B}, 'queued', false, 'ref://b')
          returning id, user_id
        `;
        const jobA = jobs.find((j: { user_id: string }) => j.user_id === USER_A)!;
        const jobB = jobs.find((j: { user_id: string }) => j.user_id === USER_B)!;
        await tx`
          insert into rmf_compare_results (job_id, user_id, summary)
          values
            (${jobA.id}, ${USER_A}, 'a'),
            (${jobB.id}, ${USER_B}, 'b')
        `;

        const serverJobs = await tx`select count(*)::int as n from rmf_compare_jobs where user_id in (${USER_A}, ${USER_B})`;
        assert.equal(Number(serverJobs[0].n), 2);

        await tx.unsafe(`set local role authenticated`);
        await tx.unsafe(`select set_config('request.jwt.claim.sub', '${USER_A}', true)`);

        const ownJobs = await tx`select user_id from rmf_compare_jobs where user_id = ${USER_A}`;
        assert.equal(ownJobs.length, 1);
        const otherJobs = await tx`select user_id from rmf_compare_jobs where user_id = ${USER_B}`;
        assert.equal(otherJobs.length, 0);

        const ownResults = await tx`select user_id from rmf_compare_results where user_id = ${USER_A}`;
        assert.equal(ownResults.length, 1);
        const otherResults = await tx`select user_id from rmf_compare_results where user_id = ${USER_B}`;
        assert.equal(otherResults.length, 0);

        const priv = await tx.unsafe(`
          select has_table_privilege('authenticated', 'rmf_compare_jobs', 'INSERT') as can_insert,
                 has_table_privilege('authenticated', 'rmf_compare_jobs', 'UPDATE') as can_update,
                 has_table_privilege('anon', 'rmf_compare_jobs', 'SELECT') as anon_select,
                 has_table_privilege('anon', 'rmf_compare_results', 'SELECT') as anon_results
        `);
        assert.equal(priv[0].can_insert, false);
        assert.equal(priv[0].can_update, false);
        assert.equal(priv[0].anon_select, false);
        assert.equal(priv[0].anon_results, false);

        await tx.unsafe(`reset role`);
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
