import { NextRequest, NextResponse } from "next/server";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime="nodejs";
export const maxDuration=30;
const RAILWAY_BROWSER="https://browser-runtime-production-307b.up.railway.app";

async function auth(request:NextRequest){return operatorRequestAuthorized(request,{allowSignalSecret:false,allowCron:false});}
function ownerToken(request:NextRequest){return request.cookies.get("rmf_owner_access")?.value||"";}
async function railway(path:string,method:"GET"|"POST",token:string){const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),25000);try{const r=await fetch(`${RAILWAY_BROWSER}${path}`,{method,headers:{"content-type":"application/json","x-rmf-owner-access":token},body:method==="POST"?"{}":undefined,cache:"no-store",signal:ctl.signal});const text=await r.text();let body:any;try{body=JSON.parse(text)}catch{body={ok:false,error:text||`HTTP_${r.status}`}}if(!r.ok)throw new Error(String(body?.error||`HTTP_${r.status}`));return body;}finally{clearTimeout(timer);}}

export async function GET(request:NextRequest){const a=await auth(request),token=ownerToken(request);if(!a.ok||!a.owner||!token)return NextResponse.json({ok:false,error:"owner_auth_required"},{status:401});try{return NextResponse.json({...await railway("/owner-session/status","GET",token),actor:a.actor});}catch(e:any){return NextResponse.json({ok:false,error:String(e?.message||e)},{status:502});}}
export async function POST(request:NextRequest){const a=await auth(request),token=ownerToken(request);if(!a.ok||!a.owner||!token)return NextResponse.json({ok:false,error:"owner_auth_required"},{status:401});try{const session=await railway("/owner-session/start","POST",token);return NextResponse.json({ok:true,actor:a.actor,viewer_url:`${RAILWAY_BROWSER}${session.viewer_path}`,vnc_password:session.vnc_password,expires_at:session.expires_at,note:"Type credentials only inside the remote browser. The operator never receives Google/ChatGPT passwords or cookies."});}catch(e:any){return NextResponse.json({ok:false,error:String(e?.message||e)},{status:502});}}
export async function DELETE(request:NextRequest){const a=await auth(request),token=ownerToken(request);if(!a.ok||!a.owner||!token)return NextResponse.json({ok:false,error:"owner_auth_required"},{status:401});try{return NextResponse.json({...await railway("/owner-session/finish","POST",token),actor:a.actor});}catch(e:any){return NextResponse.json({ok:false,error:String(e?.message||e)},{status:502});}}
