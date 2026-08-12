import { db } from "./db";
import { ensureBillingSchema } from "./stripeBilling";

let ready: Promise<void> | null = null;
export const PERSONAL_ACTION_COST = 1;
export const REPORT_ACTION_COST = 5;

export async function ensurePersonalNetworkSchema() {
  if (ready) return ready;
  ready = (async () => {
    await ensureBillingSchema();
    const sql = db();
    await sql`create table if not exists rmf_personal_profiles (user_id text primary key, profile jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now())`;
    await sql`create table if not exists rmf_interactions (id bigserial primary key, user_id text not null, kind text not null, summary text not null, data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now())`;
    await sql`create table if not exists rmf_personal_recommendations (id bigserial primary key, user_id text not null, item_type text not null default 'product', title text, url text, data jsonb not null default '{}'::jsonb, feedback text, source_interaction_id bigint, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
    await sql`create table if not exists rmf_provider_connections (user_id text not null, provider text not null, status text not null default 'planned', scopes text[] not null default '{}', external_subject text, profile_signals jsonb not null default '{}'::jsonb, token_ref text, token_expires_at timestamptz, connected_at timestamptz, revoked_at timestamptz, updated_at timestamptz not null default now(), primary key(user_id, provider))`;
    await sql`alter table rmf_provider_connections add column if not exists token_ref text`;
    await sql`alter table rmf_provider_connections add column if not exists token_expires_at timestamptz`;
    await sql`alter table rmf_provider_connections add column if not exists connected_at timestamptz`;
    await sql`alter table rmf_provider_connections add column if not exists revoked_at timestamptz`;
    await sql`alter table rmf_personal_recommendations add column if not exists source_interaction_id bigint`;
    await sql`create index if not exists rmf_interactions_user_idx on rmf_interactions(user_id, created_at desc)`;
    await sql`create index if not exists rmf_personal_recommendations_user_idx on rmf_personal_recommendations(user_id, created_at desc)`;
    await sql`create index if not exists rmf_personal_recommendations_source_interaction_idx on rmf_personal_recommendations(source_interaction_id)`;
    await sql`create index if not exists rmf_provider_connections_status_idx on rmf_provider_connections(status, updated_at desc)`;
  })();
  return ready;
}

export async function profile(userId: string) { await ensurePersonalNetworkSchema(); const sql=db(); const r=await sql`select profile, updated_at from rmf_personal_profiles where user_id=${userId} limit 1`; return r[0]||null; }
export async function updateProfile(userId:string, patch:Record<string,unknown>) { await ensurePersonalNetworkSchema(); const sql=db(); const current=await profile(userId); const merged={...(current?.profile||{}),...patch}; const r=await sql`insert into rmf_personal_profiles(user_id,profile,updated_at) values(${userId},${sql.json(merged as any)},now()) on conflict(user_id) do update set profile=excluded.profile,updated_at=now() returning profile,updated_at`; return r[0]; }
export async function saveInteraction(userId:string, kind:string, summary:string, data:Record<string,unknown>) { await ensurePersonalNetworkSchema(); const sql=db(); const r=await sql`insert into rmf_interactions(user_id,kind,summary,data) values(${userId},${kind},${summary},${sql.json(data as any)}) returning id,created_at`; return r[0]; }
export async function history(userId:string, limit=20) { await ensurePersonalNetworkSchema(); const sql=db(); return sql`select id,kind,summary,data,created_at from rmf_interactions where user_id=${userId} order by created_at desc limit ${Math.min(Math.max(limit,1),50)}`; }
export async function saveRecommendation(userId:string,input:{item_type?:string,title?:string,url?:string,data?:Record<string,unknown>,source_interaction_id?:number}) {
  await ensurePersonalNetworkSchema();
  const sql=db();
  const sourceId = input.source_interaction_id ?? null;
  const r=await sql`insert into rmf_personal_recommendations(user_id,item_type,title,url,data,source_interaction_id) values(${userId},${input.item_type||'product'},${input.title||null},${input.url||null},${sql.json((input.data||{}) as any)},${sourceId}) returning id,item_type,title,url,data,source_interaction_id,created_at`;
  return r[0];
}
/** Upsert by user+url when a product URL is present; otherwise insert. Links source_interaction_id. */
export async function upsertRecommendationFromInteraction(userId:string,input:{item_type?:string,title?:string,url?:string,data?:Record<string,unknown>,source_interaction_id:number}) {
  await ensurePersonalNetworkSchema();
  const sql=db();
  const url = input.url || null;
  if (url) {
    const existing = await sql`select id from rmf_personal_recommendations where user_id=${userId} and url=${url} order by updated_at desc limit 1`;
    if (existing[0]) {
      const r=await sql`update rmf_personal_recommendations set item_type=${input.item_type||'product'}, title=coalesce(${input.title||null}, title), data=${sql.json((input.data||{}) as any)}, source_interaction_id=${input.source_interaction_id}, updated_at=now() where id=${existing[0].id} and user_id=${userId} returning id,item_type,title,url,data,source_interaction_id,feedback,created_at,updated_at`;
      return r[0];
    }
  }
  return saveRecommendation(userId, input);
}
export async function recommendationFeedback(userId:string,id:number,feedback:string) { await ensurePersonalNetworkSchema(); const sql=db(); const r=await sql`update rmf_personal_recommendations set feedback=${feedback},updated_at=now() where id=${id} and user_id=${userId} returning id,feedback,updated_at`; return r[0]||null; }
export async function savedItems(userId:string,limit=20) { await ensurePersonalNetworkSchema(); const sql=db(); return sql`select id,item_type,title,url,data,feedback,source_interaction_id,created_at,updated_at from rmf_personal_recommendations where user_id=${userId} order by created_at desc limit ${Math.min(Math.max(limit,1),50)}`; }
/** Public connection rows — never select token_ref (encrypted secret ref only). */
export async function connections(userId: string) {
  await ensurePersonalNetworkSchema();
  const sql = db();
  return sql`
    select provider, status, scopes, profile_signals, connected_at, revoked_at, updated_at,
      (token_ref is not null) as has_token_ref
    from rmf_provider_connections
    where user_id = ${userId}
    order by provider
  `;
}
