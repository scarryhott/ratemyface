import { NextRequest, NextResponse } from "next/server";
import { browserControlOrigin, browserOwnerSessionStatus, finishBrowserOwnerSession, startBrowserOwnerSession } from "../../../../lib/browserControl";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime="nodejs";
export const maxDuration=30;

async function auth(request:NextRequest){return operatorRequestAuthorized(request,{allowSignalSecret:false,allowCron:false});}

export async function GET(request:NextRequest){const a=await auth(request);if(!a.ok||!a.owner)return NextResponse.json({ok:false,error:"owner_auth_required"},{status:401});try{return NextResponse.json({...await browserOwnerSessionStatus(),actor:a.actor});}catch(e:any){return NextResponse.json({ok:false,error:String(e?.message||e)},{status:502});}}

export async function POST(request:NextRequest){const a=await auth(request);if(!a.ok||!a.owner)return NextResponse.json({ok:false,error:"owner_auth_required"},{status:401});try{const session=await startBrowserOwnerSession();const origin=browserControlOrigin();const viewer_url=`${origin}${session.viewer_path}`;return NextResponse.json({ok:true,actor:a.actor,viewer_url,vnc_password:session.vnc_password,expires_at:session.expires_at,note:"Type credentials only inside the remote browser. The operator never receives Google/ChatGPT passwords or cookies."});}catch(e:any){return NextResponse.json({ok:false,error:String(e?.message||e)},{status:502});}}

export async function DELETE(request:NextRequest){const a=await auth(request);if(!a.ok||!a.owner)return NextResponse.json({ok:false,error:"owner_auth_required"},{status:401});try{return NextResponse.json({...await finishBrowserOwnerSession(),actor:a.actor});}catch(e:any){return NextResponse.json({ok:false,error:String(e?.message||e)},{status:502});}}
