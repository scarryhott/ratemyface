import { db, databaseConfigured } from "./db";
import {
  PLANNED_SOCIAL_PROVIDERS,
  SOCIAL_PROVIDER_OAUTH,
  type PlannedSocialProvider
} from "./providerConnections";

let ready: Promise<void> | null = null;

/** Ensure OAuth-ready provider_connections columns exist (runtime mirror of migration). */
export async function ensureProviderConnectionsSchema() {
  if (ready) return ready;
  ready = (async () => {
    if (!databaseConfigured()) return;
    const sql = db();
    await sql`
      create table if not exists rmf_provider_connections (
        user_id text not null,
        provider text not null,
        status text not null default 'planned',
        scopes text[] not null default '{}',
        external_subject text,
        profile_signals jsonb not null default '{}'::jsonb,
        token_ref text,
        token_expires_at timestamptz,
        connected_at timestamptz,
        revoked_at timestamptz,
        updated_at timestamptz not null default now(),
        primary key (user_id, provider)
      )
    `;
    await sql`alter table rmf_provider_connections add column if not exists token_ref text`;
    await sql`alter table rmf_provider_connections add column if not exists token_expires_at timestamptz`;
    await sql`alter table rmf_provider_connections add column if not exists connected_at timestamptz`;
    await sql`alter table rmf_provider_connections add column if not exists revoked_at timestamptz`;
    await sql`create index if not exists rmf_provider_connections_status_idx on rmf_provider_connections(status, updated_at desc)`;
    await sql`create index if not exists rmf_provider_connections_provider_idx on rmf_provider_connections(provider, status)`;
  })();
  return ready;
}

export type ProviderConnectionPublic = {
  provider: string;
  status: string;
  scopes: string[];
  external_subject: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  updated_at: string | null;
  /** Always false in public payloads — never expose token_ref / secrets. */
  has_token_ref: boolean;
};

function mapPublicRow(row: Record<string, unknown>): ProviderConnectionPublic {
  return {
    provider: String(row.provider || ""),
    status: String(row.status || "planned"),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    external_subject: row.external_subject == null ? null : String(row.external_subject),
    connected_at: row.connected_at == null ? null : String(row.connected_at),
    revoked_at: row.revoked_at == null ? null : String(row.revoked_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
    has_token_ref: Boolean(row.token_ref)
  };
}

/** List stored connections for a user. Never returns raw token material. */
export async function listProviderConnections(
  userId: string
): Promise<ProviderConnectionPublic[]> {
  await ensureProviderConnectionsSchema();
  const sql = db();
  const rows = await sql`
    select
      provider,
      status,
      scopes,
      external_subject,
      token_ref,
      connected_at,
      revoked_at,
      updated_at
    from rmf_provider_connections
    where user_id = ${userId}
    order by provider
  `;
  return rows.map((r: Record<string, unknown>) => mapPublicRow(r));
}

/**
 * Planned catalog + any stored rows. Used by GET /api/providers.
 * Missing providers appear as planned / not_configured (no fake connected state).
 */
export async function listProvidersCatalog(userId: string): Promise<{
  framework: {
    enabled: false;
    status: string;
    auth_mode: string;
    scraping: false;
    note: string;
  };
  planned: PlannedSocialProvider[];
  connections: ProviderConnectionPublic[];
  catalog: Array<{
    provider: PlannedSocialProvider;
    status: string;
    oauth_ready: false;
    connection: ProviderConnectionPublic | null;
  }>;
}> {
  const connections = databaseConfigured()
    ? await listProviderConnections(userId)
    : [];
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const catalog = PLANNED_SOCIAL_PROVIDERS.map((provider) => {
    const connection = byProvider.get(provider) || null;
    return {
      provider,
      status: connection?.status || SOCIAL_PROVIDER_OAUTH.status,
      oauth_ready: false as const,
      connection
    };
  });
  return {
    framework: {
      enabled: SOCIAL_PROVIDER_OAUTH.enabled,
      status: SOCIAL_PROVIDER_OAUTH.status,
      auth_mode: SOCIAL_PROVIDER_OAUTH.auth_mode,
      scraping: SOCIAL_PROVIDER_OAUTH.scraping,
      note: SOCIAL_PROVIDER_OAUTH.note
    },
    planned: [...PLANNED_SOCIAL_PROVIDERS],
    connections,
    catalog
  };
}

/** Soft-revoke a connection row (server path). Used when OAuth is later wired. */
export async function revokeProviderConnection(
  userId: string,
  provider: string
): Promise<ProviderConnectionPublic | null> {
  await ensureProviderConnectionsSchema();
  const sql = db();
  const rows = await sql`
    update rmf_provider_connections
    set
      status = 'revoked',
      revoked_at = now(),
      updated_at = now(),
      token_ref = null,
      token_expires_at = null
    where user_id = ${userId} and provider = ${provider}
    returning
      provider,
      status,
      scopes,
      external_subject,
      token_ref,
      connected_at,
      revoked_at,
      updated_at
  `;
  if (!rows[0]) return null;
  return mapPublicRow(rows[0] as Record<string, unknown>);
}
