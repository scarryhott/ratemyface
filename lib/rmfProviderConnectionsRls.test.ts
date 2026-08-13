/**
 * Structural + (optional) live isolation proofs for social provider OAuth RLS.
 *
 * Always runs: asserts migration SQL + Instagram/LinkedIn stay not_configured / no scrape.
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
import {
  SOCIAL_PROVIDER_OAUTH,
  socialProviderCredentialsConfigured,
  socialProviderNotConfiguredResponse
} from "./providerConnections.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260812190000_rmf_provider_connections_oauth.sql"
);
const HEALTH = join(__dirname, "..", "app", "api", "health", "route.ts");
const CONNECT = join(__dirname, "..", "app", "api", "providers", "connect", "route.ts");

const TABLE = "rmf_provider_connections";

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

describe("rmf provider connections OAuth migration (policy matrix)", () => {
  const sqlText = migrationSql();

  it("ensures table + token metadata placeholders + timestamps", () => {
    assert.match(sqlText, /create table if not exists public\.rmf_provider_connections/i);
    assert.match(sqlText, /token_ref text/i);
    assert.match(sqlText, /token_expires_at timestamptz/i);
    assert.match(sqlText, /connected_at timestamptz/i);
    assert.match(sqlText, /revoked_at timestamptz/i);
    assert.match(sqlText, /Never log raw secrets|encrypted refs only/i);
  });

  it("does not FORCE row level security", () => {
    assert.equal(
      /\balter\s+table\b[\s\S]*?\bforce\s+row\s+level\s+security\b/i.test(sqlText),
      false
    );
    assert.match(sqlText, /Do NOT enable FORCE/i);
  });

  it("enables RLS and own-row SELECT; no write policies", () => {
    assert.match(
      sqlText,
      new RegExp(`alter table public\\.${TABLE} enable row level security;`, "i")
    );
    assert.match(
      sqlText,
      new RegExp(
        `create policy ${TABLE}_select_own[\\s\\S]*?to authenticated[\\s\\S]*?auth\\.uid\\(\\)::text`,
        "i"
      )
    );
    assert.match(
      sqlText,
      new RegExp(`revoke all on table public\\.${TABLE} from anon, authenticated;`, "i")
    );
    assert.match(
      sqlText,
      new RegExp(`grant select on table public\\.${TABLE} to authenticated;`, "i")
    );
    assert.equal(/\bfor insert\b/i.test(sqlText), false);
    assert.equal(/\bfor update\b/i.test(sqlText), false);
    assert.equal(/\bfor delete\b/i.test(sqlText), false);
  });

  it("documents OAuth-only skeleton (no scrape / no live launch)", () => {
    assert.match(sqlText, /skeleton only|NO live OAuth/i);
    assert.match(sqlText, /Never scrape/i);
    assert.match(sqlText, /Instagram, LinkedIn, TikTok/i);
  });
});

describe("social provider OAuth gate", () => {
  it("instagram stays not_configured; scraping stays false", () => {
    assert.equal(SOCIAL_PROVIDER_OAUTH.scraping, false);
    assert.deepEqual([...SOCIAL_PROVIDER_OAUTH.providers], [
      "instagram",
      "linkedin",
      "tiktok"
    ]);
    assert.equal(socialProviderCredentialsConfigured("instagram"), false);
    assert.equal(socialProviderCredentialsConfigured("linkedin"), false);
    const stub = socialProviderNotConfiguredResponse(501, "instagram");
    assert.equal(stub.status, 501);
    assert.equal(stub.body.error, "not_configured");
  });

  it("health route reports social_providers via gate helpers", () => {
    const health = readFileSync(HEALTH, "utf8");
    assert.match(health, /social_providers/);
    assert.match(health, /configured_providers/);
    assert.match(health, /enabled:\s*SOCIAL_PROVIDER_OAUTH\.enabled/);
    assert.match(health, /from ["'].*providerConnections["']/);
  });

  it("connect keeps not_configured path for unwired providers", () => {
    const connect = readFileSync(CONNECT, "utf8");
    assert.match(connect, /socialProviderNotConfiguredResponse\(501/);
    assert.match(connect, /not_configured|tiktokAuthorizeUrl/);
  });
});

describe("rmf provider connections RLS live isolation", { skip: !testDatabaseUrl() }, () => {
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
        await tx`delete from rmf_provider_connections where user_id in (${USER_A}, ${USER_B})`;

        await tx`
          insert into rmf_provider_connections (user_id, provider, status, token_ref)
          values
            (${USER_A}, 'instagram', 'planned', 'vault://test-a'),
            (${USER_B}, 'instagram', 'planned', 'vault://test-b')
        `;

        const serverRows = await tx`
          select count(*)::int as n from rmf_provider_connections
          where user_id in (${USER_A}, ${USER_B})
        `;
        assert.equal(Number(serverRows[0].n), 2);

        await tx.unsafe(`set local role authenticated`);
        await tx.unsafe(`select set_config('request.jwt.claim.sub', '${USER_A}', true)`);

        const own = await tx`
          select user_id, provider, token_ref from rmf_provider_connections
          where user_id = ${USER_A}
        `;
        assert.equal(own.length, 1);
        const other = await tx`
          select user_id from rmf_provider_connections where user_id = ${USER_B}
        `;
        assert.equal(other.length, 0);

        const priv = await tx.unsafe(`
          select has_table_privilege('authenticated', 'rmf_provider_connections', 'INSERT') as can_insert,
                 has_table_privilege('authenticated', 'rmf_provider_connections', 'UPDATE') as can_update,
                 has_table_privilege('anon', 'rmf_provider_connections', 'SELECT') as anon_select
        `);
        assert.equal(priv[0].can_insert, false);
        assert.equal(priv[0].can_update, false);
        assert.equal(priv[0].anon_select, false);

        await tx.unsafe(`reset role`);
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
