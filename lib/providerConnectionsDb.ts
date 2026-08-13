import { db, databaseConfigured, newSchemaSlot, runOncePerDbClient } from "./db";
import {
  PLANNED_SOCIAL_PROVIDERS,
  SOCIAL_PROVIDER_OAUTH,
  socialProviderCredentialsConfigured,
  type PlannedSocialProvider
} from "./providerConnections";

const schemaSlot = newSchemaSlot();

/** Ensure OAuth-ready provider_connections columns exist (runtime mirror of migration). */
export async function ensureProviderConnectionsSchema() {
  return runOncePerDbClient(schemaSlot, async () => {
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
  });
}

export type ProviderConnectionPublic = {
  provider: string;
  status: string;
  scopes: string[];
  external_subject: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  updated_at: string | null;
  /** Boolean only — never expose token_ref / secrets. */
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
    enabled: boolean;
    status: string;
    auth_mode: string;
    scraping: false;
    note: string;
    configured_providers: PlannedSocialProvider[];
  };
  planned: PlannedSocialProvider[];
  connections: ProviderConnectionPublic[];
  catalog: Array<{
    provider: PlannedSocialProvider;
    status: string;
    oauth_ready: boolean;
    connection: ProviderConnectionPublic | null;
  }>;
}> {
  const connections = databaseConfigured()
    ? await listProviderConnections(userId)
    : [];
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const catalog = PLANNED_SOCIAL_PROVIDERS.map((provider) => {
    const connection = byProvider.get(provider) || null;
    const oauth_ready = socialProviderCredentialsConfigured(provider);
    return {
      provider,
      status: connection?.status || (oauth_ready ? "not_connected" : "not_configured"),
      oauth_ready,
      connection
    };
  });
  return {
    framework: {
      enabled: SOCIAL_PROVIDER_OAUTH.enabled,
      status: SOCIAL_PROVIDER_OAUTH.status,
      auth_mode: SOCIAL_PROVIDER_OAUTH.auth_mode,
      scraping: SOCIAL_PROVIDER_OAUTH.scraping,
      note: SOCIAL_PROVIDER_OAUTH.note,
      configured_providers: SOCIAL_PROVIDER_OAUTH.configured_providers
    },
    planned: [...PLANNED_SOCIAL_PROVIDERS],
    connections,
    catalog
  };
}

export type UpsertProviderConnectionInput = {
  userId: string;
  provider: PlannedSocialProvider;
  tokenRef: string;
  tokenExpiresAt: Date | null;
  externalSubject: string | null;
  scopes: string[];
};

/** Persist a connected OAuth row. Stores token_ref only — never returns raw tokens. */
export async function upsertConnectedProvider(
  input: UpsertProviderConnectionInput
): Promise<ProviderConnectionPublic> {
  await ensureProviderConnectionsSchema();
  const sql = db();
  const scopes = input.scopes;
  const rows = await sql`
    insert into rmf_provider_connections (
      user_id,
      provider,
      status,
      scopes,
      external_subject,
      profile_signals,
      token_ref,
      token_expires_at,
      connected_at,
      revoked_at,
      updated_at
    ) values (
      ${input.userId},
      ${input.provider},
      'connected',
      ${scopes},
      ${input.externalSubject},
      '{}'::jsonb,
      ${input.tokenRef},
      ${input.tokenExpiresAt},
      now(),
      null,
      now()
    )
    on conflict (user_id, provider) do update set
      status = 'connected',
      scopes = excluded.scopes,
      external_subject = excluded.external_subject,
      profile_signals = '{}'::jsonb,
      token_ref = excluded.token_ref,
      token_expires_at = excluded.token_expires_at,
      connected_at = now(),
      revoked_at = null,
      updated_at = now()
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
  return mapPublicRow(rows[0] as Record<string, unknown>);
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
