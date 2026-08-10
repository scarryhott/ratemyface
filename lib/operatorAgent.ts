import { db } from "./db";

let ready: Promise<void> | null = null;
export type Authority = 0|1|2|3|4|5|6;

export async function ensureOperatorSchema(){
 if(ready)return ready;
 ready=(async()=>{const sql=db();
  await sql`create table if not exists rmf_agent_signals(id bigserial primary key, source text not null, kind text not null default 'signal', payload jsonb not null default '{}'::jsonb, status text not null default 'queued', requested_authority int not null default 1, created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz)`;
  await sql`create table if not exists rmf_agent_runs(id bigserial primary key, signal_id bigint references rmf_agent_signals(id), model text, authority int not null, status text not null default 'running', context_digest text, plan jsonb, result jsonb, error text, created_at timestamptz not null default now(), completed_at timestamptz)`;
  await sql`create table if not exists rmf_agent_ledger(id bigserial primary key, run_id bigint references rmf_agent_runs(id), event text not null, capability text, authority int not null default 0, admissible boolean not null default true, detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now())`;
  await sql`create table if not exists rmf_agent_approvals(id bigserial primary key, run_id bigint references rmf_agent_runs(id), capability text not null, requested_authority int not null, status text not null default 'pending', rationale text, created_at timestamptz not null default now(), decided_at timestamptz)`;
  await sql`create table if not exists rmf_agent_context(key text primary key, value jsonb not null, updated_at timestamptz not null default now())`;
  await sql`create index if not exists rmf_agent_signals_status_idx on rmf_agent_signals(status,created_at)`;
 })();return ready;
}

export async function enqueueSignal(source:string,kind:string,payload:Record<string,unknown>,authority:Authority=1){await ensureOperatorSchema();const sql=db();const r=await sql`insert into rmf_agent_signals(source,kind,payload,requested_authority) values(${source},${kind},${sql.json(payload as any)},${authority}) returning id,status,created_at`;return r[0];}
export async function nextSignal(){await ensureOperatorSchema();const sql=db();const r=await sql`update rmf_agent_signals set status='running',started_at=now() where id=(select id from rmf_agent_signals where status='queued' order by created_at for update skip locked limit 1) returning *`;return r[0]||null;}
export async function operatorContext(){await ensureOperatorSchema();const sql=db();const [ctx,recent]=await Promise.all([sql`select key,value,updated_at from rmf_agent_context order by key`,sql`select event,capability,authority,admissible,detail,created_at from rmf_agent_ledger order by created_at desc limit 30`]);return {context:ctx,recent_ledger:recent};}
export async function ledger(runId:number,event:string,authority:number,detail:Record<string,unknown>,capability?:string,admissible=true){await ensureOperatorSchema();const sql=db();await sql`insert into rmf_agent_ledger(run_id,event,capability,authority,admissible,detail) values(${runId},${event},${capability||null},${authority},${admissible},${sql.json(detail as any)})`;}

export async function gatewayPlan(input:unknown){
 const key=process.env.AI_GATEWAY_API_KEY;if(!key)throw new Error('AI_GATEWAY_API_KEY_not_configured');
 const model=process.env.RMF_OPERATOR_MODEL||'openai/gpt-5.6-terra';
 const response=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:'You are the Rate My Face operator. Return JSON only with keys summary, observations, proposed_actions, required_authority, requires_human_approval, verification. Never request or reveal credentials. Authority: L0 observe; L1 analyze; L2 sandbox/code branch; L3 preview; L4 bounded production; L5 economic spend; L6 strategic/permission expansion. You may propose higher authority but never claim it executed.'},{role:'user',content:JSON.stringify(input)}]})});
 if(!response.ok)throw new Error(`AI_GATEWAY_${response.status}:${(await response.text()).slice(0,500)}`);const body:any=await response.json();const text=body?.choices?.[0]?.message?.content;if(!text)throw new Error('AI_GATEWAY_empty');return {model,plan:JSON.parse(text),usage:body.usage||null};
}

export async function runOneSignal(){
 const signal=await nextSignal();if(!signal)return {ok:true,idle:true};const sql=db();const authority=Math.min(Number(signal.requested_authority||1),Number(process.env.RMF_OPERATOR_MAX_AUTHORITY||1));
 const runs=await sql`insert into rmf_agent_runs(signal_id,authority,status) values(${signal.id},${authority},'running') returning id`;const runId=Number(runs[0].id);
 try{await ledger(runId,'signal_admitted',authority,{signal_id:signal.id,source:signal.source,kind:signal.kind});const context=await operatorContext();const ai=await gatewayPlan({signal:{id:signal.id,source:signal.source,kind:signal.kind,payload:signal.payload},admitted_authority:authority,project:context});const required=Math.max(0,Math.min(6,Number(ai.plan?.required_authority||1)));const approval=Boolean(ai.plan?.requires_human_approval)||required>authority;
  if(approval){await sql`insert into rmf_agent_approvals(run_id,capability,requested_authority,rationale) values(${runId},'proposed_actions',${required},${String(ai.plan?.summary||'Agent requested expanded authority')})`;await ledger(runId,'approval_required',authority,{required_authority:required,plan:ai.plan},'proposed_actions',false);}
  await sql`update rmf_agent_runs set model=${ai.model},status=${approval?'awaiting_approval':'completed'},plan=${sql.json(ai.plan)},result=${sql.json({usage:ai.usage,executed:false})},completed_at=now() where id=${runId}`;await sql`update rmf_agent_signals set status=${approval?'awaiting_approval':'completed'},completed_at=now() where id=${signal.id}`;return {ok:true,run_id:runId,status:approval?'awaiting_approval':'completed',plan:ai.plan};
 }catch(e:any){await sql`update rmf_agent_runs set status='failed',error=${String(e?.message||e)},completed_at=now() where id=${runId}`;await sql`update rmf_agent_signals set status='failed',completed_at=now() where id=${signal.id}`;await ledger(runId,'run_failed',authority,{error:String(e?.message||e)},undefined,false);throw e;}
}
