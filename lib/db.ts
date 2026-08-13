import net from "node:net";
import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;
let clientGeneration = 0;
const memorySchemaSlot: SchemaOnceSlot = { promise: null, gen: -1 };

/** Client-side backstop. postgres.js `connect_timeout` is not a real TCP/TLS deadline. */
export const DB_CONNECT_TIMEOUT_SECONDS = 5;
export const DB_STATEMENT_TIMEOUT_MS = 8000;
export const DB_LOCK_TIMEOUT_MS = 3000;
/** Whole serverless DB operation budget (compare POST, operator agents, tests). */
export const DB_OPERATION_TIMEOUT_MS = 12_000;
export const COMPARE_TEST_DB_TIMEOUT_MS = 12_000;
/** Paid Compare Action: DB + bounded vision attempt (still far below 300s). */
export const COMPARE_ACTION_TIMEOUT_MS = 20_000;
/** Paid Appearance Actions: DB-only plan/check-in (no vision). */
export const APPEARANCE_ACTION_TIMEOUT_MS = 12_000;
/** Heartbeat enqueue-only budget — must return 200/202 in under 10s. */
export const HEARTBEAT_DB_TIMEOUT_MS = 8_000;
/** Social provider connect/disconnect/callback DB budget (far below 300s). */
export const PROVIDER_OAUTH_TIMEOUT_MS = 12_000;
/** Operator worker DB budget (claim / schema / reads). Must stay ≤ 20s. */
export const OPERATOR_WORKER_DB_TIMEOUT_MS = 20_000;
/** Operator schema DDL budget — never unbounded on a serverless hot path. */
export const OPERATOR_SCHEMA_TIMEOUT_MS = 8_000;
/**
 * Hard wall for GET/POST /api/operator/run. Must abort well under maxDuration=60
 * and never sit until the 300s platform limit.
 */
export const OPERATOR_WORKER_TIMEOUT_MS = 45_000;
/** Dashboard / agents / ops read budget — JSON before the page can 504. */
export const OPERATOR_READ_TIMEOUT_MS = 12_000;

export class DatabaseTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly code = "DATABASE_TIMEOUT";
  constructor(timeoutMs: number, detail = "database_timeout") {
    super(`${detail}_${timeoutMs}ms`);
    this.name = "DatabaseTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class WorkerTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly code = "WORKER_TIMEOUT";
  constructor(timeoutMs: number, detail = "worker_timeout") {
    super(`${detail}_${timeoutMs}ms`);
    this.name = "WorkerTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export type SchemaOnceSlot = { promise: Promise<void> | null; gen: number };

function connectionString(): string | null {
  // Vercel functions should use Supabase's IPv4-compatible Supavisor pooler.
  // Keep DATABASE_URL as a fallback for local/persistent runtimes.
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || null;
}

export function databaseConfigured(): boolean {
  return Boolean(connectionString());
}

export function dbClientGeneration(): number {
  return clientGeneration;
}

export function newSchemaSlot(): SchemaOnceSlot {
  return { promise: null, gen: -1 };
}

/**
 * Cache schema DDL per live client. A hung first attempt must not pin a
 * forever-pending promise after resetDbClient() (warm isolate reuse).
 */
export function runOncePerDbClient(slot: SchemaOnceSlot, fn: () => Promise<void>): Promise<void> {
  const gen = clientGeneration;
  if (slot.promise && slot.gen === gen) return slot.promise;
  slot.gen = gen;
  const pending = fn().catch((error) => {
    if (slot.gen === gen) {
      slot.promise = null;
      slot.gen = -1;
    }
    throw error;
  });
  slot.promise = pending;
  return pending;
}

export function isWorkerTimeoutError(error: unknown): boolean {
  if (error instanceof WorkerTimeoutError) return true;
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; name?: string };
  return e.code === "WORKER_TIMEOUT" || e.name === "WorkerTimeoutError";
}

export function isDatabaseTimeoutError(error: unknown): boolean {
  if (isWorkerTimeoutError(error)) return false;
  if (error instanceof DatabaseTimeoutError) return true;
  if (!error || typeof error !== "object") {
    return typeof error === "string" && /timeout|timed out/i.test(error);
  }
  const e = error as { code?: string; message?: string; errno?: string; name?: string };
  if (e.code === "WORKER_TIMEOUT" || e.name === "WorkerTimeoutError") return false;
  if (
    e.code === "DATABASE_TIMEOUT" ||
    e.code === "CONNECT_TIMEOUT" ||
    e.code === "ETIMEDOUT" ||
    e.code === "57014" ||
    e.code === "55P03"
  ) {
    return true;
  }
  return /timeout|timed out|CONNECT_TIMEOUT|db_connect_timeout|statement timeout|lock timeout/i.test(
    String(e.message || "")
  );
}

export function isUndefinedTableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "42P01");
}

/**
 * Force IPv4 (Supabase pooler on Vercel) and a real TCP connect deadline.
 * postgres.js `connect_timeout` uses socket idle timeout and does not abort a
 * hanging SYN. TLS/pooler waits after TCP are bounded by withDatabaseTimeout.
 */
function createDbSocket(params: { host?: string | string[]; port?: number | number[] | string }): net.Socket {
  const host = String(Array.isArray(params.host) ? params.host[0] : params.host || "localhost");
  const port = Number(Array.isArray(params.port) ? params.port[0] : params.port || 5432);
  const ip6Literal = host.includes(":");
  const socket = net.connect({
    host,
    port,
    ...(ip6Literal ? {} : { family: 4 })
  }) as net.Socket & { host?: string; port?: number };
  socket.host = host;
  socket.port = port;
  const ms = DB_CONNECT_TIMEOUT_SECONDS * 1000;
  const timer = setTimeout(() => {
    socket.destroy(
      Object.assign(new Error(`db_connect_timeout_${ms}ms`), { code: "CONNECT_TIMEOUT" })
    );
  }, ms);
  const clear = () => clearTimeout(timer);
  socket.once("connect", clear);
  socket.once("error", clear);
  socket.once("close", clear);
  return socket;
}

export function resetDbClient(_reason = "reset"): void {
  clientGeneration += 1;
  const client = sqlClient;
  sqlClient = null;
  memorySchemaSlot.promise = null;
  memorySchemaSlot.gen = -1;
  if (client) {
    void client.end({ timeout: 1 }).catch(() => undefined);
  }
}

export function db() {
  if (sqlClient) return sqlClient;
  const url = connectionString();
  if (!url) throw new Error("Database is not configured. Connect a Postgres integration in Vercel and expose POSTGRES_URL or DATABASE_URL.");
  sqlClient = postgres(url, {
    max: 1,
    ssl: "require",
    prepare: false,
    fetch_types: false,
    idle_timeout: 20,
    connect_timeout: DB_CONNECT_TIMEOUT_SECONDS,
    max_lifetime: 60,
    connection: {
      statement_timeout: DB_STATEMENT_TIMEOUT_MS,
      lock_timeout: DB_LOCK_TIMEOUT_MS,
      idle_in_transaction_session_timeout: DB_STATEMENT_TIMEOUT_MS
    },
    socket: createDbSocket
  } as Parameters<typeof postgres>[1]);
  return sqlClient;
}

/**
 * Bound any DB work so a hung postgres.js socket cannot sit until the 300s
 * Vercel limit. On timeout, drop the max:1 client so the isolate is not wedged.
 */
export async function withDatabaseTimeout<T>(
  work: () => Promise<T>,
  ms: number = DB_OPERATION_TIMEOUT_MS
): Promise<T> {
  const budget = Math.max(20, Math.min(Math.trunc(ms), 25_000));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const running = Promise.resolve().then(work);
  void running.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      resetDbClient("timeout");
      reject(new DatabaseTimeoutError(budget));
    }, budget);
  });
  try {
    return await Promise.race([running, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Bound the whole operator worker (DB + GitHub + managerial loop) so Vercel
 * never kills the invocation with FUNCTION_INVOCATION_TIMEOUT. Cap is 55s so
 * a mistaken 300_000ms budget still returns JSON under maxDuration=60.
 */
export async function withWorkerTimeout<T>(
  work: () => Promise<T>,
  ms: number = OPERATOR_WORKER_TIMEOUT_MS
): Promise<T> {
  const budget = Math.max(20, Math.min(Math.trunc(ms), 55_000));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const running = Promise.resolve().then(work);
  void running.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      resetDbClient("worker_timeout");
      reject(new WorkerTimeoutError(budget));
    }, budget);
  });
  try {
    return await Promise.race([running, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function ensureMemorySchema(): Promise<void> {
  return runOncePerDbClient(memorySchemaSlot, async () => {
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
  });
}
