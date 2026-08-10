const CONTROL_URL = process.env.RMF_BROWSER_CONTROL_URL?.replace(/\/$/, "");
const CONTROL_TOKEN = process.env.RMF_BROWSER_CONTROL_TOKEN;

export type BrowserHealth = { ok: boolean; runtime?: string; session_attached?: boolean; current_url?: string; allowed_hosts?: string[]; error?: string };
export type BrowserObservation = { ok: boolean; final_url?: string; title?: string; text?: string; snapshot_digest?: string; error?: string };

function config() {
  if (!CONTROL_URL || !CONTROL_TOKEN) throw new Error("browser_control_not_configured");
  const u = new URL(CONTROL_URL);
  if (u.protocol !== "https:") throw new Error("browser_control_https_required");
  return { url: CONTROL_URL, token: CONTROL_TOKEN };
}
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const c = config(); const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
  try { const r = await fetch(`${c.url}${path}`, { ...init, cache:"no-store", signal:ctl.signal, headers:{"content-type":"application/json",authorization:`Bearer ${c.token}`,...(init.headers||{})} }); const body=await r.json().catch(()=>({ok:false,error:`HTTP_${r.status}`})); if(!r.ok) throw new Error(body?.error||`browser_control_HTTP_${r.status}`); return body as T; } finally { clearTimeout(timer); }
}
export function browserHealth(){return call<BrowserHealth>("/health",{method:"GET"});}
export function browserObserve(url:string){return call<BrowserObservation>("/observe",{method:"POST",body:JSON.stringify({url})});}
export async function browserObservationProbe(url="https://chatgpt.com/") { const health=await browserHealth(); const first=await browserObserve(url); const second=await browserObserve(url); const match=Boolean(first.snapshot_digest&&first.snapshot_digest===second.snapshot_digest); const closed=Boolean(health.ok&&first.ok&&second.ok&&match); return {ok:closed,authority:2,capability:"browser_observe",health,first:{ok:first.ok,final_url:first.final_url,title:first.title,snapshot_digest:first.snapshot_digest},second:{ok:second.ok,final_url:second.final_url,title:second.title,snapshot_digest:second.snapshot_digest},closure:{independent_reread:true,digest_match:match,closed}}; }
