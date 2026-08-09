import crypto from "crypto";
import { db } from "./db";

export const OAUTH_CLIENT_ID = (process.env.RMF_OAUTH_CLIENT_ID || "ratemyface-chatgpt").trim();

export function oauthClientSecret(): string {
  return (process.env.RMF_OAUTH_CLIENT_SECRET || "").trim();
}

export function allowedRedirectUris(): string[] {
  return (process.env.CHATGPT_OAUTH_REDIRECT_URI || "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function allowedRedirectUri(): string {
  return allowedRedirectUris()[0] || "";
}

let oauthSchemaReady: Promise<void> | null = null;

export async function ensureOAuthSchema(): Promise<void> {
  if (oauthSchemaReady) return oauthSchemaReady;
  oauthSchemaReady = (async () => {
    const sql = db();
    await sql`
      create table if not exists rmf_oauth_codes (
        code text primary key,
        user_id text not null,
        client_id text not null,
        redirect_uri text not null,
        scope text not null default '',
        expires_at timestamptz not null,
        used_at timestamptz,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists rmf_oauth_tokens (
        access_token text primary key,
        refresh_token text unique,
        user_id text not null,
        client_id text not null,
        scope text not null default '',
        expires_at timestamptz not null,
        revoked_at timestamptz,
        created_at timestamptz not null default now()
      )
    `;
    await sql`create index if not exists rmf_oauth_tokens_user_idx on rmf_oauth_tokens(user_id)`;
  })();
  return oauthSchemaReady;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function validClient(clientId: string, redirectUri: string): boolean {
  const redirects = allowedRedirectUris();
  return Boolean(
    redirects.length &&
    clientId.trim() === OAUTH_CLIENT_ID &&
    redirects.includes(redirectUri.trim())
  );
}

export function oauthClientValidation(clientId: string, redirectUri: string) {
  const redirects = allowedRedirectUris();
  return {
    client_id_match: clientId.trim() === OAUTH_CLIENT_ID,
    redirect_uri_match: redirects.includes(redirectUri.trim()),
    redirect_uri_configured: redirects.length > 0,
    received_client_id: clientId,
    received_redirect_uri: redirectUri
  };
}

export function basicClientCredentials(header: string | null): { clientId: string; clientSecret: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i < 0) return null;
    return { clientId: decodeURIComponent(decoded.slice(0, i)), clientSecret: decodeURIComponent(decoded.slice(i + 1)) };
  } catch {
    return null;
  }
}

export async function createAuthorizationCode(userId: string, clientId: string, redirectUri: string, scope: string): Promise<string> {
  await ensureOAuthSchema();
  const code = randomToken(32);
  const sql = db();
  await sql`
    insert into rmf_oauth_codes (code, user_id, client_id, redirect_uri, scope, expires_at)
    values (${code}, ${userId}, ${clientId}, ${redirectUri}, ${scope}, now() + interval '10 minutes')
  `;
  return code;
}

export async function exchangeAuthorizationCode(code: string, clientId: string, redirectUri: string) {
  await ensureOAuthSchema();
  const sql = db();
  const rows = await sql`
    select code, user_id, client_id, redirect_uri, scope
    from rmf_oauth_codes
    where code = ${code}
      and client_id = ${clientId}
      and redirect_uri = ${redirectUri}
      and used_at is null
      and expires_at > now()
    limit 1
  `;
  if (!rows.length) return null;
  await sql`update rmf_oauth_codes set used_at = now() where code = ${code}`;
  const accessToken = randomToken(36);
  const refreshToken = randomToken(36);
  const row = rows[0];
  await sql`
    insert into rmf_oauth_tokens (access_token, refresh_token, user_id, client_id, scope, expires_at)
    values (${accessToken}, ${refreshToken}, ${row.user_id}, ${clientId}, ${row.scope || ""}, now() + interval '24 hours')
  `;
  return { accessToken, refreshToken, userId: row.user_id as string, scope: (row.scope || "") as string };
}

export async function refreshAccessToken(refreshToken: string, clientId: string) {
  await ensureOAuthSchema();
  const sql = db();
  const rows = await sql`
    select user_id, scope from rmf_oauth_tokens
    where refresh_token = ${refreshToken}
      and client_id = ${clientId}
      and revoked_at is null
    limit 1
  `;
  if (!rows.length) return null;
  const accessToken = randomToken(36);
  const newRefreshToken = randomToken(36);
  const row = rows[0];
  await sql`update rmf_oauth_tokens set revoked_at = now() where refresh_token = ${refreshToken}`;
  await sql`
    insert into rmf_oauth_tokens (access_token, refresh_token, user_id, client_id, scope, expires_at)
    values (${accessToken}, ${newRefreshToken}, ${row.user_id}, ${clientId}, ${row.scope || ""}, now() + interval '24 hours')
  `;
  return { accessToken, refreshToken: newRefreshToken, userId: row.user_id as string, scope: (row.scope || "") as string };
}

export async function userForAccessToken(accessToken: string): Promise<{ id: string } | null> {
  await ensureOAuthSchema();
  const sql = db();
  const rows = await sql`
    select user_id from rmf_oauth_tokens
    where access_token = ${accessToken}
      and revoked_at is null
      and expires_at > now()
    limit 1
  `;
  return rows.length ? { id: rows[0].user_id as string } : null;
}
