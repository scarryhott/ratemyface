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
    await sql`create table if not exists rmf_recommendations (id bigserial primary key, user_id text not null, item_type text not null default 'product', title text, url text, data jsonb not null default '{}'::jsonb, feedback text, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
    await sql`create table if not exists rmf_provider_connections (user_id text not null, provider text not null, status text not null default 'planned', scopes text[] not null default '{}', external_subject text, profile_signals jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), primary key(user_id, provider))`;
    await sql`create index if not exists rmf_interactions_user_idx on rmf_interactions(user_id, created_at desc)`;
    await sql`create index if not exists rmf_recommendations_user_idx on rmf_recommendations(user_id, created_at desc)`;
  })();
  return ready;
}

export async function profile(userId: string) { await ensurePersonalNetworkSchema(); const sql=db(); const r=await sql`select profile, updated_at from rmf_personal_profiles where user_id=${userId} limit 1`; return r[0]||null; }
export async function updateProfile(userId:string, patch:Record<string,unknown>) { await ensurePersonalNetworkSchema(); const sql=db(); const current=await profile(userId); const merged={...(current?.profile||{}),...patch}; const r=await sql`insert into rmf_personal_profiles(user_id,profile,updated_at) values(${userId},${sql.json(merged as any)},now()) on conflict(user_id) do update set profile=excluded.profile,updated_at=now() returning profile,updated_at`; return r[0]; }
export async function saveInteraction(userId:string, kind:string, summary:string, data:Record<string,unknown>) { await ensurePersonalNetworkSchema(); const sql=db(); const r=await sql`insert into rmf_interactions(user_id,kind,summary,data) values(${userId},${kind},${summary},${sql.json(data as any)}) returning id,created_at`; return r[0]; }
export async function history(userId:string, limit=20) { await ensurePersonalNetworkSchema(); const sql=db(); return sql`select id,kind,summary,data,created_at from rmf_interactions where user_id=${userId} order by created_at desc limit ${Math.min(Math.max(limit,1),50)}`; }
export async function saveRecommendation(userId:string,input:{item_type?:string,title?:string,url?:string,data?:Record<string,unknown>}) { await ensurePersonalNetworkSchema(); const sql=db(); const r=await sql`insert into rmf_recommendations(user_id,item_type,title,url,data) values(${userId},${input.item_type||'product'},${input.title||null},${input.url||null},${sql.json((input.data||{}) as any)}) returning id,item_type,title,url,data,created_at`; return r[0]; }
export async function recommendationFeedback(userId:string,id:number,feedback:string) { await ensurePersonalNetworkSchema(); const sql=db(); const r=await sql`update rmf_recommendations set feedback=${feedback},updated_at=now() where id=${id} and user_id=${userId} returning id,feedback,updated_at`; return r[0]||null; }
export async function savedItems(userId:string,limit=20) { await ensurePersonalNetworkSchema(); const sql=db(); return sql`select id,item_type,title,url,data,feedback,created_at,updated_at from rmf_recommendations where user_id=${userId} order by created_at desc limit ${Math.min(Math.max(limit,1),50)}`; }
export async function connections(userId:string) { await ensurePersonalNetworkSchema(); const sql=db(); return sql`select provider,status,scopes,profile_signals,updated_at from rmf_provider_connections where user_id=${userId} order by provider`; }
