/**
 * Structural + (optional) live isolation proofs for Appearance Agent RLS.
 *
 * Always runs: asserts migration SQL encodes the policy matrix and does not
 * enable the product feature (not LIVE paid coaching).
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
import { APPEARANCE_AGENT } from "./appearanceAgent.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260812200000_create_rmf_appearance_agent_tables.sql"
);
const HEALTH = join(__dirname, "..", "app", "api", "health", "route.ts");

const TABLES = ["rmf_appearance_plans", "rmf_appearance_checkins"] as const;

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

describe("rmf appearance agent RLS migration (policy matrix)", () => {
  const sqlText = migrationSql();

  it("creates appearance plans + checkins tables", () => {
    assert.match(sqlText, /create table if not exists public\.rmf_appearance_plans/i);
    assert.match(sqlText, /create table if not exists public\.rmf_appearance_checkins/i);
    assert.match(sqlText, /status text not null default 'draft'/i);
    assert.match(sqlText, /draft.*active.*paused.*completed/i);
    assert.match(sqlText, /day_index/i);
    assert.match(sqlText, /baseline_image_ref/i);
    assert.match(sqlText, /baseline_interaction_id/i);
    assert.match(sqlText, /recommendation_id/i);
    assert.match(sqlText, /interaction_id/i);
    assert.match(sqlText, /compare_job_id/i);
  });

  it("does not FORCE row level security", () => {
    assert.equal(
      /\balter\s+table\b[\s\S]*?\bforce\s+row\s+level\s+security\b/i.test(sqlText),
      false
    );
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

  it("documents feature remains disabled / not LIVE coaching", () => {
    assert.match(sqlText, /DISABLED for users/i);
    assert.match(sqlText, /Not LIVE paid coaching/i);
    assert.match(sqlText, /Do NOT wire product UI|feature remains DISABLED/i);
  });
});

describe("appearance agent feature gate stays off", () => {
  it("APPEARANCE_AGENT.enabled is false", () => {
    assert.equal(APPEARANCE_AGENT.enabled, false);
    assert.equal(APPEARANCE_AGENT.status, "requires_compare_and_learning");
    assert.equal(APPEARANCE_AGENT.dashboard_status, "DISABLED");
    assert.equal(APPEARANCE_AGENT.target_days, 90);
  });

  it("health route still reports appearance agent disabled via gate constant", () => {
    const health = readFileSync(HEALTH, "utf8");
    assert.match(health, /appearance_agent/);
    assert.match(health, /FEATURE REMAINS DISABLED/);
    assert.match(health, /not LIVE paid coaching/i);
    assert.match(health, /enabled:\s*APPEARANCE_AGENT\.enabled/);
    assert.match(health, /status:\s*APPEARANCE_AGENT\.status/);
    assert.match(health, /from ["'].*appearanceAgent["']/);
  });
});

describe("rmf appearance agent RLS live isolation", { skip: !testDatabaseUrl() }, () => {
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
        await tx`delete from rmf_appearance_checkins where user_id in (${USER_A}, ${USER_B})`;
        await tx`delete from rmf_appearance_plans where user_id in (${USER_A}, ${USER_B})`;

        const plans = await tx`
          insert into rmf_appearance_plans (user_id, goal, status, day_index)
          values
            (${USER_A}, 'professional polish', 'draft', 0),
            (${USER_B}, 'grooming routine', 'draft', 0)
          returning id, user_id
        `;
        const planA = plans.find((j: { user_id: string }) => j.user_id === USER_A)!;
        const planB = plans.find((j: { user_id: string }) => j.user_id === USER_B)!;
        await tx`
          insert into rmf_appearance_checkins (plan_id, user_id, day_index, summary)
          values
            (${planA.id}, ${USER_A}, 0, 'a'),
            (${planB.id}, ${USER_B}, 0, 'b')
        `;

        const serverPlans = await tx`select count(*)::int as n from rmf_appearance_plans where user_id in (${USER_A}, ${USER_B})`;
        assert.equal(Number(serverPlans[0].n), 2);

        await tx.unsafe(`set local role authenticated`);
        await tx.unsafe(`select set_config('request.jwt.claim.sub', '${USER_A}', true)`);

        const ownPlans = await tx`select user_id from rmf_appearance_plans where user_id = ${USER_A}`;
        assert.equal(ownPlans.length, 1);
        const otherPlans = await tx`select user_id from rmf_appearance_plans where user_id = ${USER_B}`;
        assert.equal(otherPlans.length, 0);

        const ownCheckins = await tx`select user_id from rmf_appearance_checkins where user_id = ${USER_A}`;
        assert.equal(ownCheckins.length, 1);
        const otherCheckins = await tx`select user_id from rmf_appearance_checkins where user_id = ${USER_B}`;
        assert.equal(otherCheckins.length, 0);

        const priv = await tx.unsafe(`
          select has_table_privilege('authenticated', 'rmf_appearance_plans', 'INSERT') as can_insert,
                 has_table_privilege('authenticated', 'rmf_appearance_plans', 'UPDATE') as can_update,
                 has_table_privilege('anon', 'rmf_appearance_plans', 'SELECT') as anon_select,
                 has_table_privilege('anon', 'rmf_appearance_checkins', 'SELECT') as anon_checkins
        `);
        assert.equal(priv[0].can_insert, false);
        assert.equal(priv[0].can_update, false);
        assert.equal(priv[0].anon_select, false);
        assert.equal(priv[0].anon_checkins, false);

        await tx.unsafe(`reset role`);
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
