const RAW_CONTROL_URL = process.env.RMF_BROWSER_CONTROL_URL;
const CONTROL_TOKEN = process.env.RMF_BROWSER_CONTROL_TOKEN;

export type BrowserHealth = { ok:boolean; runtime?:string; session_attached?:boolean; current_url?:string; allowed_hosts?:string[]; interactive_login_active?:boolean; error?:string };
export type BrowserObservation = { ok:boolean; final_url?:string; title?:string; text?:string; snapshot_digest?:string; error?:string };
export type BrowserOwnerSession = { ok:boolean; session_token:string; vnc_password:string; expires_at:string; viewer_path:string };

function normalizeControlUrl(raw?: string) {
  if (!raw) return "";
  let value = raw.trim();
  value = value.replace(/^['"`]+|['"`]+$/g, "").trim();
  value = value.replace(/^\[([^\]]+)\]\([^\)]+\)$/i, "$1").trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const u = new URL(value);
  if (u.protocol !== "https:") throw new Error("browser_control_https_required");
  u.pathname = u.pathname.replace(/\/+$/, "");
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}

function config(){
  const url=normalizeControlUrl(RAW_CONTROL_URL);
  if(!url||!CONTROL_TOKEN)throw new Error("browser_control_not_configured");
  return{url,token:CONTROL_TOKEN};
}
async function call<T>(path:string,init:RequestInit={}):Promise<T>{const c=config();const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),20000);try{const r=await fetch(`${c.url}${path}`,{...init,cache:"no-store",signal:ctl.signal,headers:{"content-type":"application/json",authorization:`Bearer ${c.token}`,...(init.headers||{})}});const body=await r.json().catch(()=>({ok:false,error:`HTTP_${r.status}`}));if(!r.ok)throw new Error(body?.error||`browser_control_HTTP_${r.status}`);return body as T;}finally{clearTimeout(timer);}}
export function browserControlOrigin(){return config().url;}
export function browserHealth(){return call<BrowserHealth>("/health",{method:"GET"});}
export function browserObserve(url:string){return call<BrowserObservation>("/observe",{method:"POST",body:JSON.stringify({url})});}
export function startBrowserOwnerSession(){return call<BrowserOwnerSession>("/owner-session/start",{method:"POST",body:"{}"});}
export function browserOwnerSessionStatus(){return call<{ok:boolean;active:boolean;expires_at:string|null}>("/owner-session/status",{method:"GET"});}
export function finishBrowserOwnerSession(){return call<{ok:boolean;finished:boolean}>("/owner-session/finish",{method:"POST",body:"{}"});}
export async function browserObservationProbe(url="https://chatgpt.com/"){const health=await browserHealth();const first=await browserObserve(url);const second=await browserObserve(url);const match=Boolean(first.snapshot_digest&&first.snapshot_digest===second.snapshot_digest);const closed=Boolean(health.ok&&first.ok&&second.ok&&match);return{ok:closed,authority:2,capability:"browser_observe",health,first:{ok:first.ok,final_url:first.final_url,title:first.title,snapshot_digest:first.snapshot_digest},second:{ok:second.ok,final_url:second.final_url,title:second.title,snapshot_digest:second.snapshot_digest},closure:{independent_reread:true,digest_match:match,closed}};}
