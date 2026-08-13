/**
 * Structural + optional live isolation proofs for Personal Experiments RLS.
 *
 * Always: migration contains least-privilege grants, own-row policies, and
 * option/outcome integrity constraints. With RMF_RLS_TEST_DATABASE_URL (or a
 * localhost database): proves own-row ALLOW, cross-user DENY, anon DENY, and
 * postgres server-role writes.
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
  "20260813194000_create_personal_experiments.sql"
);
const OPTIMIZATION = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260813195500_optimize_personal_experiment_rls.sql"
);
const TABLES = ["rmf_personal_experiments", "rmf_personal_experiment_outcomes"] as const;

function migrationSql(): string {
  return readFileSync(MIGRATION, "utf8");
}

function optimizationSql(): string {
  return readFileSync(OPTIMIZATION, "utf8");
}

function testDatabaseUrl(): string | null {
  const explicit = process.env.RMF_RLS_TEST_DATABASE_URL;
  if (explicit) return explicit;
  const fallback = process.env.POSTGRES_URL || process.env.DATABASE_URL || null;
  if (!fallback) return null;
  return /localhost|127\.0\.0\.1/.test(fallback) ? fallback : null;
}

describe("Personal Experiments RLS migration", () => {
  const sqlText = migrationSql();

  it("creates experiments and outcomes with relational integrity", () => {
    assert.match(sqlText, /create table if not exists public\.rmf_personal_experiments/i);
    assert.match(sqlText, /create table if not exists public\.rmf_personal_experiment_outcomes/i);
    assert.match(sqlText, /option_key text not null check \(option_key in \('a', 'b'\)\)/i);
    assert.match(sqlText, /score smallint not null check \(score >= 1 and score <= 5\)/i);
    assert.match(sqlText, /distinct_options/i);
    assert.match(sqlText, /foreign key \(experiment_id, user_id\)/i);
  });

  it("enables RLS without FORCE and grants authenticated SELECT only", () => {
    assert.equal(/\bforce\s+row\s+level\s+security\b/i.test(sqlText), false);
    for (const table of TABLES) {
      assert.match(sqlText, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      assert.match(
        sqlText,
        new RegExp(
          `create policy ${table}_select_own[\\s\\S]*?to authenticated[\\s\\S]*?auth\\.uid\\(\\)::text`,
          "i"
        )
      );
      assert.match(sqlText, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"));
      assert.match(sqlText, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
    }
    assert.equal(/\bfor insert\b/i.test(sqlText), false);
    assert.equal(/\bfor update\b/i.test(sqlText), false);
    assert.equal(/\bfor delete\b/i.test(sqlText), false);
  });

  it("includes the advisor-driven composite index and init-plan policy form", () => {
    const optimized = optimizationSql();
    assert.match(
      optimized,
      /rmf_personal_experiment_outcomes_experiment_user_idx[\s\S]*?\(experiment_id, user_id\)/i
    );
    assert.match(optimized, /using \(user_id = \(\(select auth\.uid\(\)\)::text\)\)/i);
  });
});

describe("Personal Experiments live RLS isolation", { skip: !testDatabaseUrl() }, () => {
  const USER_A = "11111111-1111-4111-8111-111111111111";
  const USER_B = "22222222-2222-4222-8222-222222222222";

  it("proves A-own ALLOW, A-to-B DENY, anon DENY, and server ALLOW", async () => {
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
        returns uuid language sql stable
        as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $f$;
        grant execute on function auth.uid() to anon, authenticated;
      `);
      await sql.unsafe(migrationSql());
      await sql.unsafe(optimizationSql());

      await sql.begin(async (tx) => {
        await tx`delete from rmf_personal_experiment_outcomes where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_personal_experiments where user_id in (${USER_A}, ${USER_B})`;
        const experiments = await tx`
          insert into rmf_personal_experiments
            (user_id,title,option_a_label,option_b_label,metric_label)
          values
            (${USER_A},'A experiment','A1','A2','confidence'),
            (${USER_B},'B experiment','B1','B2','confidence')
          returning id,user_id
        `;
        const experimentA = experiments.find((row: { user_id: string }) => row.user_id === USER_A)!;
        const experimentB = experiments.find((row: { user_id: string }) => row.user_id === USER_B)!;
        await tx`
          insert into rmf_personal_experiment_outcomes
            (experiment_id,user_id,option_key,score)
          values
            (${experimentA.id},${USER_A},'a',5),
            (${experimentB.id},${USER_B},'b',4)
        `;

        const serverRows = await tx`
          select count(*)::int as n from rmf_personal_experiments
          where user_id in (${USER_A}, ${USER_B})
        `;
        assert.equal(Number(serverRows[0].n), 2);

        await tx.unsafe("set local role authenticated");
        await tx.unsafe(`select set_config('request.jwt.claim.sub', '${USER_A}', true)`);
        assert.equal((await tx`select id from rmf_personal_experiments where user_id=${USER_A}`).length, 1);
        assert.equal((await tx`select id from rmf_personal_experiments where user_id=${USER_B}`).length, 0);
        assert.equal((await tx`select id from rmf_personal_experiment_outcomes where user_id=${USER_A}`).length, 1);
        assert.equal((await tx`select id from rmf_personal_experiment_outcomes where user_id=${USER_B}`).length, 0);

        const privileges = await tx.unsafe(`
          select
            has_table_privilege('authenticated', 'rmf_personal_experiments', 'INSERT') as can_insert,
            has_table_privilege('authenticated', 'rmf_personal_experiments', 'UPDATE') as can_update,
            has_table_privilege('anon', 'rmf_personal_experiments', 'SELECT') as anon_experiments,
            has_table_privilege('anon', 'rmf_personal_experiment_outcomes', 'SELECT') as anon_outcomes
        `);
        assert.equal(privileges[0].can_insert, false);
        assert.equal(privileges[0].can_update, false);
        assert.equal(privileges[0].anon_experiments, false);
        assert.equal(privileges[0].anon_outcomes, false);
        await tx.unsafe("reset role");
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
