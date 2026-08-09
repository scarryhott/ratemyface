import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;
let schemaReady: Promise<void> | null = null;

function connectionString(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

export function databaseConfigured(): boolean {
  return Boolean(connectionString());
}

export function db() {
  if (sqlClient) return sqlClient;
  const url = connectionString();
  if (!url) throw new Error("Database is not configured. Connect a Postgres integration in Vercel and expose DATABASE_URL or POSTGRES_URL.");
  sqlClient = postgres(url, {
    max: 1,
    ssl: "require",
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10
  });
  return sqlClient;
}

export async function ensureMemorySchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = db();
    await sql`
      create table if not exists rmf_users (
        id text primary key,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        consent_personalization boolean not null default false,
        consent_history boolean not null default false
      )
    `;
    await sql`
      create table if not exists rmf_user_context (
        user_id text primary key references rmf_users(id) on delete cascade,
        context jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists rmf_conversation_summaries (
        id bigserial primary key,
        user_id text not null references rmf_users(id) on delete cascade,
        summary text not null,
        tags jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists rmf_recommendations (
        id bigserial primary key,
        user_id text not null references rmf_users(id) on delete cascade,
        asin text,
        title text,
        affiliate_url text,
        context jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `;
    await sql`create index if not exists rmf_conversation_summaries_user_created_idx on rmf_conversation_summaries(user_id, created_at desc)`;
    await sql`create index if not exists rmf_recommendations_user_created_idx on rmf_recommendations(user_id, created_at desc)`;
  })();
  return schemaReady;
}
