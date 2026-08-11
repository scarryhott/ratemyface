import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { operatorOwnerFromRequest } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";
const RUNTIME=(process.env.RMF_BROWSER_RUNTIME_URL||"https://browser-runtime-production-307b.up.railway.app").replace(/\/$/,"");
const ACTIONS:Record<string,{method:"GET"|"POST";path:string}>={
  status:{method:"GET",path:"/health-detailed"},
  session:{method:"GET",path:"/session-state"},
  login:{method:"GET",path:"/login-required"},
  navigate:{method:"POST",path:"/navigate"},
  observe:{method:"POST",path:"/observe"},
  receipt:{method:"POST",path:"/receipt"},
  logout:{method:"POST",path:"/logout-site"},
  ownerStart:{method:"POST",path:"/owner-session/start"},
  ownerStatus:{method:"GET",path:"/owner-session/status"},
  ownerFinish:{method:"POST",path:"/owner-session/finish"},
};
function mint(owner:{id:string;method:string}){const key=process.env.RMF_BROWSER_GRANT_SECRET||"";if(!key)throw new Error("browser_grant_not_configured");const now=Math.floor(Date.now()/1000);const payload={sub:owner.id,actor:`owner:${owner.method}`,aud:"rmf-browser-runtime",scope:["browser:state","browser:navigate","browser:observe","browser:receipt","browser:owner-session"],iat:now,exp:now+120,jti:crypto.randomUUID()};const body=Buffer.from(JSON.stringify(payload)).toString("base64url");const sig=crypto.createHmac("sha256",key).update(body).digest("base64url");return`${body}.${sig}`}
async function run(request:NextRequest){const owner=await operatorOwnerFromRequest(request);if(!owner)return NextResponse.json({ok:false,error:"not_authenticated_or_not_authorized"},{status:401});try{const input=request.method==="POST"?await request.json().catch(()=>({})):Object.fromEntries(request.nextUrl.searchParams);const action=String(input.action||request.nextUrl.searchParams.get("action")||"status");const spec=ACTIONS[action];if(!spec)return NextResponse.json({ok:false,error:"unsupported_action",actions:Object.keys(ACTIONS)},{status:400});const upstream=new URL(spec.path,RUNTIME);if(spec.method==="GET"&&input.url)upstream.searchParams.set("url",String(input.url));const init:RequestInit={method:spec.method,headers:{"x-rmf-browser-grant":mint(owner),"content-type":"application/json"},cache:"no-store"};if(spec.method==="POST")init.body=JSON.stringify(input.url?{url:String(input.url)}:{});const r=await fetch(upstream,init);const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data={raw:text}}if(action==="ownerStart"&&data?.viewer_path)data.viewer_url=`${RUNTIME}${data.viewer_path}`;return NextResponse.json({proxy_ok:r.ok,action,...data},{status:r.status,headers:{"cache-control":"no-store"}})}catch(e){return NextResponse.json({ok:false,error:String((e as Error)?.message||e)},{status:502})}}
export async function GET(request:NextRequest){return run(request)}
export async function POST(request:NextRequest){return run(request)}
